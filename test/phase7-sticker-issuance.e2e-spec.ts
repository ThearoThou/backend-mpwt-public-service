import 'reflect-metadata';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from '../src/applications/entities/renewal-application-status-history.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { RefreshSession } from '../src/auth/entities/refresh-session.entity';
import { configureApiApplication } from '../src/common/http/api-application.configuration';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';
import { Inspection } from '../src/inspections/entities/inspection.entity';
import { InspectionResult } from '../src/inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../src/inspections/enums/inspection-status.enum';
import { PaymentPdfService } from '../src/payments/payment-pdf.service';
import { Appointment } from '../src/scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../src/scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { AppointmentStatus } from '../src/scheduling/enums/appointment-status.enum';
import { Sticker } from '../src/stickers/entities/sticker.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { Vehicle } from '../src/vehicles/entities/vehicle.entity';
import { VehicleClass } from '../src/vehicles/enums/vehicle-class.enum';
import { VehiclePlateCategory } from '../src/vehicles/enums/vehicle-plate-category.enum';
import {
  assertApprovedE2eDatabase,
  truncateApprovedE2eData,
} from './e2e/e2e-safety';
import { loadE2eEnvironment } from './e2e/e2e-environment';

interface HappyPathFixture {
  adminId: string;
  citizenId: string;
  adminToken: string;
  applicationId: string;
  inspectionId: string;
  stationId: string;
}

describe('Phase 7 sticker issuance workflow (PostgreSQL/API)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tokens: AuthTokenService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      // AppModule includes the payment PDF provider. Phase 7 E2E does not test
      // Puppeteer rendering, so preserve the established HTTP E2E override.
      .overrideProvider(PaymentPdfService)
      .useValue({
        generateInvoice: () =>
          Promise.resolve(Buffer.from('%PDF-1.7 e2e invoice')),
        generateReceipt: () =>
          Promise.resolve(Buffer.from('%PDF-1.7 e2e receipt')),
        generateInspectionSheet: () =>
          Promise.resolve(Buffer.from('%PDF-1.7 e2e inspection sheet')),
      })
      .compile();

    app = module.createNestApplication();
    configureApiApplication(
      app,
      app.get(ConfigService).getOrThrow('API_PREFIX'),
    );
    await app.init();

    dataSource = app.get(DataSource);
    tokens = app.get(AuthTokenService);

    const environment = loadE2eEnvironment();
    await assertApprovedE2eDatabase(dataSource, environment);

    // Give a clear failure if the isolated E2E database has not yet been
    // evolved to Migration 12. Do not silently mutate schema from this test.
    const migration12Columns = await dataSource.query<
      Array<{ columnName: string }>
    >(`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'stickers'
        AND column_name IN ('inspection_id', 'status')
    `);
    const columnNames = migration12Columns.map(({ columnName }) => columnName);
    if (
      !columnNames.includes('inspection_id') ||
      columnNames.includes('status')
    ) {
      throw new Error(
        'Phase 7 E2E requires Migration 12 on the isolated E2E database: stickers.inspection_id must exist and legacy stickers.status must be absent.',
      );
    }

    await truncateApprovedE2eData(dataSource, environment);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await truncateApprovedE2eData(dataSource, loadE2eEnvironment());
    }
    if (app) await app.close();
  });

  it('issues a sticker atomically and completes the application', async () => {
    const fixture = await createHappyPathFixture(dataSource, tokens);
    const api = app.getHttpServer();

    const response = await request(api)
      .post(`/api/admin/stickers/applications/${fixture.applicationId}/issue`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ stickerNumber: 'PHASE7-E2E-001' })
      .expect(201);

    expect(response.body.data).toMatchObject({
      state: 'ISSUED',
      application: {
        id: fixture.applicationId,
        status: ApplicationStatus.COMPLETED,
      },
      inspection: {
        id: fixture.inspectionId,
      },
      station: {
        id: fixture.stationId,
      },
      sticker: {
        stickerNumber: 'PHASE7-E2E-001',
      },
      actions: {
        canIssueSticker: false,
      },
    });
    expect(response.body.data.sticker.issuedAt).toBeTruthy();

    const stickers = await dataSource.query<
      Array<{
        applicationId: string;
        inspectionId: string;
        stickerNumber: string;
        issuedAt: Date;
        issuedByUserId: string | null;
      }>
    >(
      `SELECT
         "application_id" AS "applicationId",
         "inspection_id" AS "inspectionId",
         "sticker_number" AS "stickerNumber",
         "issued_at" AS "issuedAt",
         "issued_by_user_id" AS "issuedByUserId"
       FROM "stickers"
       WHERE "application_id" = $1`,
      [fixture.applicationId],
    );

    expect(stickers).toHaveLength(1);
    expect(stickers[0]).toMatchObject({
      applicationId: fixture.applicationId,
      inspectionId: fixture.inspectionId,
      stickerNumber: 'PHASE7-E2E-001',
      issuedByUserId: fixture.adminId,
    });
    expect(stickers[0]?.issuedAt).toBeInstanceOf(Date);

    const application = await dataSource
      .getRepository(RenewalApplication)
      .findOneByOrFail({ id: fixture.applicationId });

    expect(application.status).toBe(ApplicationStatus.COMPLETED);
    expect(application.completedAt).toBeInstanceOf(Date);
    expect(stickers[0]?.issuedAt.getTime()).toBe(
      application.completedAt?.getTime(),
    );

    const history = await dataSource
      .getRepository(RenewalApplicationStatusHistory)
      .find({
        where: {
          applicationId: fixture.applicationId,
          reason: 'STICKER_ISSUED',
        },
      });

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      applicationId: fixture.applicationId,
      previousStatus: ApplicationStatus.APPROVED,
      newStatus: ApplicationStatus.COMPLETED,
      changedByUserId: fixture.adminId,
      reason: 'STICKER_ISSUED',
    });

    expect(
      await dataSource
        .getRepository(Sticker)
        .countBy({ applicationId: fixture.applicationId }),
    ).toBe(1);
  });

  it('rejects an approved application without a completed PASS without mutating it', async () => {
    const fixture = await createHappyPathFixture(dataSource, tokens, false);
    const response = await request(app.getHttpServer())
      .post(`/api/admin/stickers/applications/${fixture.applicationId}/issue`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ stickerNumber: 'PHASE7-E2E-INELIGIBLE' })
      .expect(409);

    expect(response.body.code).toBe('STICKER_PASS_INSPECTION_REQUIRED');
    expect(
      await dataSource
        .getRepository(Sticker)
        .countBy({ applicationId: fixture.applicationId }),
    ).toBe(0);
    const application = await dataSource
      .getRepository(RenewalApplication)
      .findOneByOrFail({ id: fixture.applicationId });
    expect(application.status).toBe(ApplicationStatus.APPROVED);
    expect(application.completedAt).toBeNull();
    expect(
      await dataSource.getRepository(RenewalApplicationStatusHistory).countBy({
        applicationId: fixture.applicationId,
        reason: 'STICKER_ISSUED',
      }),
    ).toBe(0);
  });

  it('maps a duplicate sticker number and rolls back the second application', async () => {
    const first = await createHappyPathFixture(dataSource, tokens);
    const second = await createHappyPathFixture(dataSource, tokens);
    const api = app.getHttpServer();

    await request(api)
      .post(`/api/admin/stickers/applications/${first.applicationId}/issue`)
      .set('Authorization', `Bearer ${first.adminToken}`)
      .send({ stickerNumber: 'PHASE7-E2E-DUPLICATE' })
      .expect(201);

    const duplicate = await request(api)
      .post(`/api/admin/stickers/applications/${second.applicationId}/issue`)
      .set('Authorization', `Bearer ${second.adminToken}`)
      .send({ stickerNumber: 'PHASE7-E2E-DUPLICATE' })
      .expect(409);

    expect(duplicate.body.code).toBe('STICKER_NUMBER_CONFLICT');
    const [
      firstApplication,
      secondApplication,
      firstHistory,
      secondHistory,
      serialCount,
    ] = await Promise.all([
      dataSource
        .getRepository(RenewalApplication)
        .findOneByOrFail({ id: first.applicationId }),
      dataSource
        .getRepository(RenewalApplication)
        .findOneByOrFail({ id: second.applicationId }),
      dataSource.getRepository(RenewalApplicationStatusHistory).countBy({
        applicationId: first.applicationId,
        reason: 'STICKER_ISSUED',
      }),
      dataSource.getRepository(RenewalApplicationStatusHistory).countBy({
        applicationId: second.applicationId,
        reason: 'STICKER_ISSUED',
      }),
      dataSource.query<Array<{ count: string }>>(
        'SELECT count(*)::text AS count FROM stickers WHERE sticker_number = $1',
        ['PHASE7-E2E-DUPLICATE'],
      ),
    ]);
    expect(
      await dataSource
        .getRepository(Sticker)
        .countBy({ applicationId: first.applicationId }),
    ).toBe(1);
    expect(firstApplication.status).toBe(ApplicationStatus.COMPLETED);
    expect(firstApplication.completedAt).toBeInstanceOf(Date);
    expect(firstHistory).toBe(1);
    expect(
      await dataSource
        .getRepository(Sticker)
        .countBy({ applicationId: second.applicationId }),
    ).toBe(0);
    expect(secondApplication.status).toBe(ApplicationStatus.APPROVED);
    expect(secondApplication.completedAt).toBeNull();
    expect(secondHistory).toBe(0);
    expect(serialCount[0]?.count).toBe('1');
  });
});

async function createHappyPathFixture(
  dataSource: DataSource,
  tokens: AuthTokenService,
  includePass = true,
): Promise<HappyPathFixture> {
  const suffix = randomUUID().replaceAll('-', '');
  const adminId = randomUUID();
  const citizenId = randomUUID();
  const adminSessionId = randomUUID();
  const categoryId = randomUUID();
  const vehicleId = randomUUID();
  const applicationId = randomUUID();
  const stationId = randomUUID();
  const capacityId = randomUUID();
  const appointmentId = randomUUID();
  const inspectionId = randomUUID();

  const [clock] = await dataSource.query<Array<{ today: string }>>(`
    SELECT (now() AT TIME ZONE 'Asia/Phnom_Penh')::date::text AS "today"
  `);
  if (clock === undefined) {
    throw new Error('Cambodia-local E2E date is unavailable.');
  }

  await dataSource.transaction(async (manager) => {
    await manager.getRepository(User).save([
      {
        id: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        phone: null,
        email: `p7-admin-${suffix}@example.test`,
        passwordHash: 'test',
        phoneVerifiedAt: null,
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
      },
      {
        id: citizenId,
        role: UserRole.CITIZEN,
        status: UserStatus.ACTIVE,
        phone: null,
        email: `p7-citizen-${suffix}@example.test`,
        passwordHash: 'test',
        phoneVerifiedAt: null,
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
      },
    ]);

    await manager.getRepository(RefreshSession).save({
      id: adminSessionId,
      userId: adminId,
      tokenHash: 'test',
      expiresAt: new Date(Date.now() + 3_600_000),
      lastUsedAt: null,
    });

    await manager.getRepository(InspectionVehicleCategory).save({
      id: categoryId,
      code: `P7-${suffix}`,
      nameKh: 'test',
      nameEn: 'test',
      vehicleClass: VehicleClass.LIGHT,
      validityMonths: 12,
      inspectionFeeKhr: '1.00',
      serviceFeeKhr: '0.00',
      isActive: true,
    });

    await manager.getRepository(Vehicle).save({
      id: vehicleId,
      linkedCitizenId: citizenId,
      registrationNumber: `P7-${suffix}`,
      plateNumber: `P7-${suffix.slice(0, 8)}`,
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: 'Phnom Penh',
      plateType: 'PRIVATE',
      vehicleType: 'CAR',
      vehicleClass: VehicleClass.LIGHT,
      inspectionCategoryId: categoryId,
      classificationVerifiedAt: new Date(),
      classificationVerifiedBy: adminId,
      make: 'Test',
      model: 'Vehicle',
      manufactureYear: 2020,
      chassisNumber: `P7C-${suffix}`,
      firstRegistrationDate: '2020-01-01',
      lastInspectionDate: null,
      inspectionExpiryDate: clock.today,
      registeredOwnerNameKh: 'test',
      registeredOwnerNameEn: 'test',
      registeredOwnerPhone: '012345678',
      isActive: true,
    });

    await manager.getRepository(InspectionStation).save({
      id: stationId,
      code: `P7-${suffix.slice(0, 10)}`,
      nameKh: 'test',
      nameEn: 'test',
      province: 'Phnom Penh',
      address: 'test',
      phone: null,
      isActive: true,
    });

    await manager.getRepository(InspectionStationDailyCapacity).save({
      id: capacityId,
      stationId,
      capacityDate: clock.today,
      dailyCapacity: 2,
      reservedCount: 1,
      isClosed: false,
    });

    await manager.getRepository(RenewalApplication).save({
      id: applicationId,
      referenceNumber: `P7-${suffix}`,
      citizenId,
      vehicleId,
      status: ApplicationStatus.APPROVED,
      applicantSnapshot: {
        fullNameKh: 'E2E Citizen',
        fullNameEn: 'E2E Citizen',
      },
      vehicleSnapshot: {
        registrationNumber: `P7-${suffix}`,
        plateNumber: `P7-${suffix.slice(0, 8)}`,
        make: 'Test',
        model: 'Vehicle',
      },
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: stationId,
      preferredInspectionDate: clock.today,
      submittedAt: new Date(),
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
    });

    const completedAt = new Date();

    await manager.getRepository(Appointment).save({
      id: appointmentId,
      applicationId,
      slotId: null,
      dailyCapacityId: capacityId,
      status: AppointmentStatus.COMPLETED,
      completedAt,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      noShowMarkedAt: null,
      noShowMarkedByUserId: null,
    });

    if (includePass)
      await manager.getRepository(Inspection).save({
        id: inspectionId,
        applicationId,
        appointmentId,
        attemptNumber: 1,
        status: InspectionStatus.COMPLETED,
        result: InspectionResult.PASS,
        recordedByUserId: adminId,
        startedAt: null,
        completedAt,
        failureReason: null,
        notes: null,
      });
  });

  const signed = await tokens.signAccessToken({
    userId: adminId,
    role: UserRole.ADMIN,
    sessionId: adminSessionId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  return {
    adminId,
    citizenId,
    adminToken: signed.token,
    applicationId,
    inspectionId,
    stationId,
  };
}
