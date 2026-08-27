import 'reflect-metadata';

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource, type EntitySubscriberInterface } from 'typeorm';

import { AppModule } from '../src/app.module';
import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { RefreshSession } from '../src/auth/entities/refresh-session.entity';
import { configureApiApplication } from '../src/common/http/api-application.configuration';
import { FilesService } from '../src/files/files.service';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';
import { Payment } from '../src/payments/entities/payment.entity';
import { PaymentPdfService } from '../src/payments/payment-pdf.service';
import { PaymentStatusHistory } from '../src/payments/entities/payment-status-history.entity';
import { PaymentMethod } from '../src/payments/enums/payment-method.enum';
import { PaymentStatus } from '../src/payments/enums/payment-status.enum';
import { Appointment } from '../src/scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../src/scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { AppointmentStatus } from '../src/scheduling/enums/appointment-status.enum';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { Vehicle } from '../src/vehicles/entities/vehicle.entity';
import { VehicleClass } from '../src/vehicles/enums/vehicle-class.enum';
import { VehiclePlateCategory } from '../src/vehicles/enums/vehicle-plate-category.enum';
import { truncateApprovedE2eData } from './e2e/e2e-safety';
import { loadE2eEnvironment } from './e2e/e2e-environment';

interface Fixture {
  adminId: string;
  citizenId: string;
  otherCitizenId: string;
  adminToken: string;
  citizenToken: string;
  otherCitizenToken: string;
  categoryId: string;
  vehicleId: string;
  applicationId: string;
  stationId: string;
  capacityId: string;
}

interface CambodiaDateFixtures {
  future: string;
  thirtyDaysAhead: string;
  thirtyOneDaysAhead: string;
  today: string;
  yesterday: string;
  thirtyDaysAgo: string;
  thirtyOneDaysAgo: string;
  fortyDaysAgo: string;
}

describe('Phase 5D.9 payment workflow (PostgreSQL/API)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tokens: AuthTokenService;
  let files: FilesService;
  let cambodiaDates: CambodiaDateFixtures;
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      // PostgreSQL/API E2E verifies the payment workflow and persistence, not
      // browser rendering. Jest's CommonJS runtime cannot execute Puppeteer's
      // installed ESM entrypoint; PaymentPdfService rendering is unit-tested.
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
    files = app.get(FilesService);
    const [dates] = await dataSource.query<Array<CambodiaDateFixtures>>(`
      SELECT
        cambodia_date::text AS "today",
        (cambodia_date + 1)::text AS "future",
        (cambodia_date + 30)::text AS "thirtyDaysAhead",
        (cambodia_date + 31)::text AS "thirtyOneDaysAhead",
        (cambodia_date - 1)::text AS "yesterday",
        (cambodia_date - 30)::text AS "thirtyDaysAgo",
        (cambodia_date - 31)::text AS "thirtyOneDaysAgo",
        (cambodia_date - 40)::text AS "fortyDaysAgo"
      FROM (
        SELECT (now() AT TIME ZONE 'Asia/Phnom_Penh')::date AS cambodia_date
      ) AS dates
    `);
    if (dates === undefined) {
      throw new Error(
        'Could not determine the Cambodia-local e2e fixture date.',
      );
    }
    cambodiaDates = dates;
  });

  afterAll(async () => {
    for (const fixture of fixtures) {
      const payments = await dataSource
        .getRepository(Payment)
        .find({ where: { applicationId: fixture.applicationId } });
      for (const payment of payments) {
        for (const key of [
          payment.invoiceFileKey,
          payment.receiptFileKey,
          payment.inspectionSheetFileKey,
        ]) {
          if (key !== null) await files.deleteIfExists(key);
        }
      }
    }
    await truncateApprovedE2eData(dataSource, loadE2eEnvironment());
    await app.close();
  });

  it('enforces Cambodia-local renewal eligibility at 31 and 30 days before expiry', async () => {
    const notYetEligible = await createFixture(
      ApplicationStatus.DRAFT,
      cambodiaDates.thirtyOneDaysAhead,
      false,
      VehicleClass.LIGHT,
      false,
    );
    const api = app.getHttpServer();
    const rejection = await request(api)
      .post('/api/applications')
      .set('Authorization', `Bearer ${notYetEligible.citizenToken}`)
      .send({ vehicleId: notYetEligible.vehicleId })
      .expect(409);
    expect(rejection.body).toMatchObject({
      code: 'VEHICLE_NOT_YET_ELIGIBLE_FOR_RENEWAL',
    });

    const eligible = await createFixture(
      ApplicationStatus.DRAFT,
      cambodiaDates.thirtyDaysAhead,
      false,
      VehicleClass.LIGHT,
      false,
    );
    const creation = await request(api)
      .post('/api/applications')
      .set('Authorization', `Bearer ${eligible.citizenToken}`)
      .send({ vehicleId: eligible.vehicleId })
      .expect(201);
    expect(creation.body.data).toMatchObject({
      status: ApplicationStatus.DRAFT,
      vehicleId: eligible.vehicleId,
    });
  });

  it('initializes from review-pass, preserves snapshots, protects citizen documents, and completes transitions', async () => {
    const fixture = await createFixture(
      ApplicationStatus.UNDER_REVIEW,
      cambodiaDates.yesterday,
    );
    const api = app.getHttpServer();
    const review = await request(api)
      .post(`/api/admin/applications/${fixture.applicationId}/review-pass`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .expect(201);
    expect(review.body.data.status).toBe(ApplicationStatus.APPROVED);

    const [application, capacity, appointments, payment] = await Promise.all([
      dataSource
        .getRepository(RenewalApplication)
        .findOneByOrFail({ id: fixture.applicationId }),
      dataSource
        .getRepository(InspectionStationDailyCapacity)
        .findOneByOrFail({ id: fixture.capacityId }),
      dataSource
        .getRepository(Appointment)
        .findBy({ applicationId: fixture.applicationId }),
      dataSource
        .getRepository(Payment)
        .findOneByOrFail({ applicationId: fixture.applicationId }),
    ]);
    expect(application.status).toBe(ApplicationStatus.APPROVED);
    expect(capacity.reservedCount).toBe(1);
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe(AppointmentStatus.SCHEDULED);
    expect(payment).toMatchObject({
      status: PaymentStatus.PENDING,
      method: PaymentMethod.PAY_AT_STATION,
      inspectionFeeKhr: '55000.00',
      serviceFeeKhr: '5000.00',
      baseAmount: '60000.00',
      previousInspectionExpiryDate: cambodiaDates.yesterday,
      lateDays: 1,
      lateFee: '0.00',
      totalAmount: '60000.00',
      currency: 'KHR',
      receiptNumber: null,
      receiptFileKey: null,
      inspectionSheetFileKey: null,
      providerName: null,
      providerTransactionId: null,
    });
    expect(payment.invoiceNumber).toMatch(/^INV-\d{8}-\d{6}$/);
    expect(payment.invoiceFileKey).not.toBeNull();
    await expect(files.read(payment.invoiceFileKey as string)).resolves.toEqual(
      expect.objectContaining({ length: expect.any(Number) }),
    );
    const invoice = await files.read(payment.invoiceFileKey as string);
    expect(invoice.length).toBeGreaterThan(0);
    expect(invoice.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      await dataSource
        .getRepository(PaymentStatusHistory)
        .countBy({ paymentId: payment.id }),
    ).toBe(0);

    await dataSource
      .getRepository(InspectionVehicleCategory)
      .update(fixture.categoryId, {
        inspectionFeeKhr: '99999.00',
        serviceFeeKhr: '1.00',
      });
    const immutable = await dataSource
      .getRepository(Payment)
      .findOneByOrFail({ id: payment.id });
    expect([
      immutable.inspectionFeeKhr,
      immutable.serviceFeeKhr,
      immutable.baseAmount,
      immutable.lateFee,
      immutable.totalAmount,
    ]).toEqual(['55000.00', '5000.00', '60000.00', '0.00', '60000.00']);

    const citizen = await request(api)
      .get(`/api/payments/applications/${fixture.applicationId}`)
      .set('Authorization', `Bearer ${fixture.citizenToken}`)
      .expect(200);
    expect(citizen.body.data).toMatchObject({
      baseAmount: '60000.00',
      lateFee: '0.00',
      totalAmount: '60000.00',
      invoiceAvailable: true,
      receiptAvailable: false,
      inspectionSheetAvailable: false,
    });
    expect(citizen.body.data).not.toHaveProperty('invoiceFileKey');
    expect(citizen.body.data).not.toHaveProperty('providerTransactionId');
    await request(api)
      .get(`/api/payments/applications/${fixture.applicationId}`)
      .set('Authorization', `Bearer ${fixture.otherCitizenToken}`)
      .expect(403);
    const invoiceDownload = await request(api)
      .get(`/api/payments/applications/${fixture.applicationId}/invoice`)
      .set('Authorization', `Bearer ${fixture.citizenToken}`)
      .expect(200);
    expect(invoiceDownload.headers['content-type']).toContain(
      'application/pdf',
    );
    expect(invoiceDownload.headers['content-disposition']).toContain(
      `${payment.invoiceNumber}.pdf`,
    );
    expect(Buffer.from(invoiceDownload.body).subarray(0, 5).toString()).toBe(
      '%PDF-',
    );
    await request(api)
      .get(`/api/payments/applications/${fixture.applicationId}/receipt`)
      .set('Authorization', `Bearer ${fixture.citizenToken}`)
      .expect(404);
    await request(api)
      .get(`/api/payments/applications/${fixture.applicationId}/invoice`)
      .set('Authorization', `Bearer ${fixture.otherCitizenToken}`)
      .expect(403);

    const list = await request(api)
      .get(
        `/api/admin/payments?status=PENDING&method=PAY_AT_STATION&search=${payment.invoiceNumber.slice(-6)}&sortBy=totalAmount&sortOrder=asc&page=1&limit=10`,
      )
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .expect(200);
    expect(list.body.meta).toMatchObject({
      page: 1,
      limit: 10,
      total: expect.any(Number),
      totalPages: expect.any(Number),
    });
    expect(
      list.body.data.some((item: { id: string }) => item.id === payment.id),
    ).toBe(true);
    await request(api)
      .get('/api/admin/payments?sortBy=unsafe')
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .expect(400);

    const failure = new Error('force real payment history rollback');
    const subscriber: EntitySubscriberInterface<PaymentStatusHistory> = {
      listen: () => PaymentStatusHistory,
      afterInsert: () => {
        throw failure;
      },
    };
    dataSource.subscribers.push(subscriber);
    try {
      await request(api)
        .post(`/api/admin/payments/${payment.id}/reject`)
        .set('Authorization', `Bearer ${fixture.adminToken}`)
        .send({ reason: ' rollback ' })
        .expect(500);
    } finally {
      dataSource.subscribers.splice(
        dataSource.subscribers.indexOf(subscriber),
        1,
      );
    }
    expect(
      await dataSource
        .getRepository(Payment)
        .findOneByOrFail({ id: payment.id }),
    ).toMatchObject({
      status: PaymentStatus.PENDING,
      rejectedAt: null,
      rejectionReason: null,
    });
    expect(
      await dataSource
        .getRepository(PaymentStatusHistory)
        .countBy({ paymentId: payment.id }),
    ).toBe(0);

    await request(api)
      .post(`/api/admin/payments/${payment.id}/reject`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ reason: ' rejected by cashier ' })
      .expect(201);
    const rejected = await dataSource
      .getRepository(Payment)
      .findOneByOrFail({ id: payment.id });
    expect(rejected).toMatchObject({
      status: PaymentStatus.REJECTED,
      rejectionReason: 'rejected by cashier',
      rejectedByUserId: fixture.adminId,
    });
    await request(api)
      .post(`/api/admin/payments/${payment.id}/reopen`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ reason: ' reopen ' })
      .expect(201);
    expect(
      await dataSource
        .getRepository(Payment)
        .findOneByOrFail({ id: payment.id }),
    ).toMatchObject({
      status: PaymentStatus.PENDING,
      rejectionReason: 'rejected by cashier',
    });

    const confirmed = await request(api)
      .post(`/api/admin/payments/${payment.id}/confirm`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ paymentReference: ' CASH-001 ' })
      .expect(201);
    expect(confirmed.body.data).toMatchObject({
      status: PaymentStatus.CONFIRMED,
      paymentReference: 'CASH-001',
      confirmedByUserId: fixture.adminId,
    });
    const finalPayment = await dataSource
      .getRepository(Payment)
      .findOneByOrFail({ id: payment.id });
    expect(finalPayment.receiptNumber).toMatch(/^RCP-\d{8}-\d{6}$/);
    expect(finalPayment.receiptFileKey).not.toBeNull();
    expect(finalPayment.inspectionSheetFileKey).not.toBeNull();
    for (const key of [
      finalPayment.receiptFileKey,
      finalPayment.inspectionSheetFileKey,
    ]) {
      const artifact = await files.read(key as string);
      expect(artifact.length).toBeGreaterThan(0);
      expect(artifact.subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect(
      await dataSource
        .getRepository(InspectionStationDailyCapacity)
        .findOneByOrFail({ id: fixture.capacityId }),
    ).toMatchObject({ reservedCount: 1 });
    expect(
      await dataSource
        .getRepository(RenewalApplication)
        .findOneByOrFail({ id: fixture.applicationId }),
    ).toMatchObject({ status: ApplicationStatus.APPROVED });
    expect(
      await dataSource
        .getRepository(Appointment)
        .findOneByOrFail({ applicationId: fixture.applicationId }),
    ).toMatchObject({ status: AppointmentStatus.SCHEDULED });
    const history = await request(api)
      .get(`/api/admin/payments/${payment.id}/history`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .expect(200);
    expect(
      history.body.data.map(
        (entry: {
          fromStatus: string;
          toStatus: string;
          reason: string | null;
        }) => [entry.fromStatus, entry.toStatus, entry.reason],
      ),
    ).toEqual([
      ['PENDING', 'REJECTED', 'rejected by cashier'],
      ['REJECTED', 'PENDING', 'reopen'],
      ['PENDING', 'CONFIRMED', null],
    ]);
    for (const endpoint of ['confirm', 'reject', 'reopen']) {
      await request(api)
        .post(`/api/admin/payments/${payment.id}/${endpoint}`)
        .set('Authorization', `Bearer ${fixture.adminToken}`)
        .send(
          endpoint === 'confirm'
            ? { paymentReference: 'no' }
            : { reason: 'no' },
        )
        .expect(409)
        .expect(({ body }) =>
          expect(body.code).toBe('PAYMENT_INVALID_TRANSITION'),
        );
    }
    for (const endpoint of ['invoice', 'receipt', 'inspection-sheet']) {
      const response = await request(api)
        .get(`/api/payments/applications/${fixture.applicationId}/${endpoint}`)
        .set('Authorization', `Bearer ${fixture.citizenToken}`)
        .expect(200);
      expect(Buffer.from(response.body).subarray(0, 5).toString()).toBe(
        '%PDF-',
      );
      await request(api)
        .get(`/api/payments/applications/${fixture.applicationId}/${endpoint}`)
        .set('Authorization', `Bearer ${fixture.otherCitizenToken}`)
        .expect(403);
    }
  });

  it('does not reserve capacity, create an appointment, or initialize payment when review passes', async () => {
    const api = app.getHttpServer();
    const selection = await createFixture(
      ApplicationStatus.UNDER_REVIEW,
      cambodiaDates.today,
    );
    await dataSource
      .getRepository(InspectionStationDailyCapacity)
      .update(selection.capacityId, { dailyCapacity: 1, reservedCount: 1 });
    await request(api)
      .post(`/api/admin/applications/${selection.applicationId}/review-pass`)
      .set('Authorization', `Bearer ${selection.adminToken}`)
      .expect(201)
      .expect(({ body }) =>
        expect(body.data.status).toBe(ApplicationStatus.APPROVED),
      );
    expect(
      await dataSource
        .getRepository(Payment)
        .countBy({ applicationId: selection.applicationId }),
    ).toBe(0);
    expect(
      await dataSource
        .getRepository(Appointment)
        .countBy({ applicationId: selection.applicationId }),
    ).toBe(0);
    expect(
      await dataSource
        .getRepository(InspectionStationDailyCapacity)
        .findOneByOrFail({ id: selection.capacityId }),
    ).toMatchObject({ reservedCount: 1 });
  });

  it('allows confirmation from rejected and retains its rejection history', async () => {
    const fixture = await createFixture(
      ApplicationStatus.APPROVED,
      cambodiaDates.today,
      true,
    );
    const api = app.getHttpServer();
    const initialized = await request(api)
      .post(
        `/api/admin/payments/applications/${fixture.applicationId}/initialize`,
      )
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .expect(201);
    const paymentId = initialized.body.data.id as string;
    await request(api)
      .post(`/api/admin/payments/${paymentId}/reject`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ reason: ' rejected once ' })
      .expect(201);
    await request(api)
      .post(`/api/admin/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${fixture.adminToken}`)
      .send({ paymentReference: 'CASH-REJECTED' })
      .expect(201);
    const payment = await dataSource
      .getRepository(Payment)
      .findOneByOrFail({ id: paymentId });
    expect(payment).toMatchObject({
      status: PaymentStatus.CONFIRMED,
      rejectionReason: 'rejected once',
      confirmedByUserId: fixture.adminId,
    });
    const history = await dataSource.getRepository(PaymentStatusHistory).find({
      where: { paymentId },
      order: { createdAt: 'ASC' },
    });
    expect(
      history.map((entry) => [entry.fromStatus, entry.toStatus, entry.reason]),
    ).toEqual([
      [PaymentStatus.PENDING, PaymentStatus.REJECTED, 'rejected once'],
      [PaymentStatus.REJECTED, PaymentStatus.CONFIRMED, null],
    ]);
  });

  it('calculates Cambodia-local no-penalty threshold and class-specific late fees', async () => {
    for (const { expiry, vehicleClass, lateDays, lateFee, totalAmount } of [
      {
        expiry: cambodiaDates.future,
        vehicleClass: VehicleClass.LIGHT,
        lateDays: 0,
        lateFee: '0.00',
        totalAmount: '60000.00',
      },
      {
        expiry: cambodiaDates.today,
        vehicleClass: VehicleClass.LIGHT,
        lateDays: 0,
        lateFee: '0.00',
        totalAmount: '60000.00',
      },
      {
        expiry: cambodiaDates.yesterday,
        vehicleClass: VehicleClass.LIGHT,
        lateDays: 1,
        lateFee: '0.00',
        totalAmount: '60000.00',
      },
      {
        expiry: cambodiaDates.thirtyDaysAgo,
        vehicleClass: VehicleClass.LIGHT,
        lateDays: 30,
        lateFee: '0.00',
        totalAmount: '60000.00',
      },
      {
        expiry: cambodiaDates.thirtyDaysAgo,
        vehicleClass: VehicleClass.HEAVY,
        lateDays: 30,
        lateFee: '0.00',
        totalAmount: '60000.00',
      },
      {
        expiry: cambodiaDates.thirtyOneDaysAgo,
        vehicleClass: VehicleClass.LIGHT,
        lateDays: 31,
        lateFee: '15500.00',
        totalAmount: '75500.00',
      },
      {
        expiry: cambodiaDates.fortyDaysAgo,
        vehicleClass: VehicleClass.LIGHT,
        lateDays: 40,
        lateFee: '20000.00',
        totalAmount: '80000.00',
      },
      {
        expiry: cambodiaDates.thirtyOneDaysAgo,
        vehicleClass: VehicleClass.HEAVY,
        lateDays: 31,
        lateFee: '62000.00',
        totalAmount: '122000.00',
      },
      {
        expiry: cambodiaDates.fortyDaysAgo,
        vehicleClass: VehicleClass.HEAVY,
        lateDays: 40,
        lateFee: '80000.00',
        totalAmount: '140000.00',
      },
    ]) {
      const fixture = await createFixture(
        ApplicationStatus.APPROVED,
        expiry,
        true,
        vehicleClass,
      );
      const response = await request(app.getHttpServer())
        .post(
          `/api/admin/payments/applications/${fixture.applicationId}/initialize`,
        )
        .set('Authorization', `Bearer ${fixture.adminToken}`)
        .expect(201);
      expect(response.body.data).toMatchObject({
        lateDays,
        lateFee,
        baseAmount: '60000.00',
        totalAmount,
      });
      const payment = await dataSource
        .getRepository(Payment)
        .findOneByOrFail({ applicationId: fixture.applicationId });
      expect([
        payment.inspectionFeeKhr,
        payment.serviceFeeKhr,
        payment.baseAmount,
        payment.lateFee,
        payment.totalAmount,
      ]).toEqual(['55000.00', '5000.00', '60000.00', lateFee, totalAmount]);
    }
  });

  async function createFixture(
    status: ApplicationStatus,
    expiry: string,
    scheduled = false,
    vehicleClass = VehicleClass.LIGHT,
    createApplication = true,
  ): Promise<Fixture> {
    const suffix = randomUUID().replaceAll('-', '');
    const fixture: Fixture = {
      adminId: randomUUID(),
      citizenId: randomUUID(),
      otherCitizenId: randomUUID(),
      adminToken: '',
      citizenToken: '',
      otherCitizenToken: '',
      categoryId: randomUUID(),
      vehicleId: randomUUID(),
      applicationId: randomUUID(),
      stationId: randomUUID(),
      capacityId: randomUUID(),
    };
    const sessionIds = [randomUUID(), randomUUID(), randomUUID()];
    const capacityDate = '2099-01-01';
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(User).save([
        {
          id: fixture.adminId,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          phone: null,
          email: `p5-admin-${suffix}@example.test`,
          passwordHash: 'test',
          phoneVerifiedAt: null,
          emailVerifiedAt: new Date(),
          lastLoginAt: null,
        },
        {
          id: fixture.citizenId,
          role: UserRole.CITIZEN,
          status: UserStatus.ACTIVE,
          phone: null,
          email: `p5-citizen-${suffix}@example.test`,
          passwordHash: 'test',
          phoneVerifiedAt: null,
          emailVerifiedAt: new Date(),
          lastLoginAt: null,
        },
        {
          id: fixture.otherCitizenId,
          role: UserRole.CITIZEN,
          status: UserStatus.ACTIVE,
          phone: null,
          email: `p5-other-${suffix}@example.test`,
          passwordHash: 'test',
          phoneVerifiedAt: null,
          emailVerifiedAt: new Date(),
          lastLoginAt: null,
        },
      ]);
      await manager.getRepository(RefreshSession).save(
        sessionIds.map((id, index) => ({
          id,
          userId: [fixture.adminId, fixture.citizenId, fixture.otherCitizenId][
            index
          ],
          tokenHash: 'test',
          expiresAt: new Date(Date.now() + 3_600_000),
          lastUsedAt: null,
        })),
      );
      await manager.getRepository(InspectionVehicleCategory).save({
        id: fixture.categoryId,
        code: `P5-${suffix}`,
        nameKh: 'test',
        nameEn: 'test',
        vehicleClass,
        validityMonths: 12,
        inspectionFeeKhr: '55000.00',
        serviceFeeKhr: '5000.00',
        isActive: true,
      });
      await manager.getRepository(Vehicle).save({
        id: fixture.vehicleId,
        linkedCitizenId: fixture.citizenId,
        registrationNumber: `P5-${suffix}`,
        plateNumber: `P5-${suffix.slice(0, 8)}`,
        plateCategory: VehiclePlateCategory.PROVINCE,
        plateProvince: 'Phnom Penh',
        plateType: 'PRIVATE',
        vehicleType: 'CAR',
        vehicleClass,
        inspectionCategoryId: fixture.categoryId,
        classificationVerifiedAt: new Date(),
        classificationVerifiedBy: fixture.adminId,
        make: 'Test',
        model: 'Vehicle',
        manufactureYear: 2020,
        chassisNumber: `P5C-${suffix}`,
        firstRegistrationDate: '2020-01-01',
        lastInspectionDate: null,
        inspectionExpiryDate: expiry,
        registeredOwnerNameKh: 'test',
        registeredOwnerNameEn: 'test',
        registeredOwnerPhone: '012345678',
        isActive: true,
      });
      await manager.getRepository(InspectionStation).save({
        id: fixture.stationId,
        code: `P5-${suffix.slice(0, 10)}`,
        nameKh: 'test',
        nameEn: 'test',
        province: 'Phnom Penh',
        address: 'test',
        phone: null,
        isActive: true,
      });
      await manager.getRepository(InspectionStationDailyCapacity).save({
        id: fixture.capacityId,
        stationId: fixture.stationId,
        capacityDate,
        dailyCapacity: 4,
        reservedCount: scheduled ? 1 : 0,
        isClosed: false,
      });
      if (createApplication) {
        await manager.getRepository(RenewalApplication).save({
          id: fixture.applicationId,
          referenceNumber: `P5-${suffix}`,
          citizenId: fixture.citizenId,
          vehicleId: fixture.vehicleId,
          status,
          applicantSnapshot: null,
          vehicleSnapshot: null,
          currentCorrectionReason: null,
          currentRejectionReason: null,
          preferredInspectionStationId: fixture.stationId,
          preferredInspectionDate: capacityDate,
          submittedAt: new Date(),
          reviewStartedAt:
            status === ApplicationStatus.UNDER_REVIEW ? new Date() : null,
          readyForInspectionAt: null,
          completedAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
        });
      }
      if (scheduled)
        await manager.getRepository(Appointment).save({
          id: randomUUID(),
          applicationId: fixture.applicationId,
          slotId: null,
          dailyCapacityId: fixture.capacityId,
          status: AppointmentStatus.SCHEDULED,
          completedAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
          noShowMarkedAt: null,
          noShowMarkedByUserId: null,
        });
    });
    const signed = await Promise.all(
      [fixture.adminId, fixture.citizenId, fixture.otherCitizenId].map(
        (userId, index) =>
          tokens.signAccessToken({
            userId,
            role: index === 0 ? UserRole.ADMIN : UserRole.CITIZEN,
            sessionId: sessionIds[index],
            expiresAt: new Date(Date.now() + 3_600_000),
          }),
      ),
    );
    [fixture.adminToken, fixture.citizenToken, fixture.otherCitizenToken] =
      signed.map((value) => value.token) as [string, string, string];
    fixtures.push(fixture);
    return fixture;
  }
});
