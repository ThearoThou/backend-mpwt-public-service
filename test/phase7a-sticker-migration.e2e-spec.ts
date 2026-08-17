import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';

import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import { EvolveStickersForIssuedInspection1786940836385 } from '../src/database/migrations/1786940836385-EvolveStickersForIssuedInspection';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';
import { Inspection } from '../src/inspections/entities/inspection.entity';
import { InspectionResult } from '../src/inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../src/inspections/enums/inspection-status.enum';
import { Appointment } from '../src/scheduling/entities/appointment.entity';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { InspectionStationDailyCapacity } from '../src/scheduling/entities/inspection-station-daily-capacity.entity';
import { AppointmentStatus } from '../src/scheduling/enums/appointment-status.enum';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { Vehicle } from '../src/vehicles/entities/vehicle.entity';
import { VehicleClass } from '../src/vehicles/enums/vehicle-class.enum';
import { VehiclePlateCategory } from '../src/vehicles/enums/vehicle-plate-category.enum';
import {
  e2eDataSource,
  initializeApprovedE2eDataSource,
} from './e2e/e2e-data-source';
import { assertApprovedE2eDatabase } from './e2e/e2e-safety';
import { loadE2eEnvironment } from './e2e/e2e-environment';

describe('Migration 12 issued stickers (PostgreSQL)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await initializeApprovedE2eDataSource();
    await assertApprovedE2eDatabase(dataSource, loadE2eEnvironment());
  });

  afterAll(async () => {
    if (e2eDataSource.isInitialized) await e2eDataSource.destroy();
  });

  it('executes against the actual legacy schema and creates the issued-sticker schema and constraints', async () => {
    await inMigrationTransaction(dataSource, async (runner) => {
      await new EvolveStickersForIssuedInspection1786940836385().up(runner);

      const columns = (await runner.query(`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stickers'
      `)) as Array<{ column_name: string; is_nullable: string }>;
      const nullable = new Map(
        columns.map((column) => [column.column_name, column.is_nullable]),
      );
      expect([...nullable.keys()]).toEqual(
        expect.arrayContaining([
          'id',
          'application_id',
          'inspection_id',
          'sticker_number',
          'issued_at',
          'issued_by_user_id',
          'created_at',
          'updated_at',
        ]),
      );
      expect(
        [
          'status',
          'certificate_number',
          'certificate_file_key',
          'ready_at',
          'marked_ready_by_user_id',
          'pickup_recipient_name',
          'pickup_notes',
        ].every((column) => !nullable.has(column)),
      ).toBe(true);
      expect(nullable.get('inspection_id')).toBe('NO');
      expect(nullable.get('sticker_number')).toBe('NO');
      expect(nullable.get('issued_at')).toBe('NO');
      expect(nullable.get('issued_by_user_id')).toBe('YES');

      const constraints = (await runner.query(`
        SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'stickers'
      `)) as Array<{ conname: string; definition: string }>;
      const constraint = new Map(
        constraints.map((item) => [item.conname, item.definition]),
      );
      for (const name of [
        'uq_stickers_application',
        'uq_stickers_inspection',
        'uq_stickers_sticker_number',
        'chk_stickers_sticker_number_trimmed_nonempty',
        'fk_stickers_application',
        'fk_stickers_inspection',
        'fk_stickers_issued_by_user',
      ])
        expect(constraint.has(name)).toBe(true);
      expect(constraint.get('fk_stickers_application')).toContain(
        'REFERENCES renewal_applications(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
      );
      expect(constraint.get('fk_stickers_inspection')).toContain(
        'REFERENCES inspections(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
      );
      expect(constraint.get('fk_stickers_issued_by_user')).toContain(
        'REFERENCES users(id) ON UPDATE RESTRICT ON DELETE SET NULL',
      );
      expect(
        await runner.query(
          `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_stickers_issued_at'`,
        ),
      ).toHaveLength(1);
      expect(
        await runner.query(
          `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'sticker_status'`,
        ),
      ).toHaveLength(0);
    });
  });

  it('enforces issued-sticker values, uniqueness, and foreign-key deletion behavior', async () => {
    await inMigrationTransaction(dataSource, async (runner) => {
      await new EvolveStickersForIssuedInspection1786940836385().up(runner);
      const first = await createCompletedInspectionFixture(runner.manager);
      const second = await createCompletedInspectionFixture(runner.manager);
      const third = await createCompletedInspectionFixture(runner.manager);
      const issuedByUserId = randomUUID();
      await runner.manager.getRepository(User).save({
        id: issuedByUserId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        phone: null,
        email: `p7-issuer-${randomUUID()}@test`,
        passwordHash: 'test',
        phoneVerifiedAt: null,
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
      });

      await expectStickerError(
        runner,
        [first.applicationId, first.inspectionId, null, new Date()],
        '23502',
      );
      await expectStickerError(
        runner,
        [first.applicationId, null, 'NULL-INSPECTION', new Date()],
        '23502',
      );
      await expectStickerError(
        runner,
        [first.applicationId, first.inspectionId, '', new Date()],
        '23514',
      );
      await expectStickerError(
        runner,
        [first.applicationId, first.inspectionId, ' ABC123 ', new Date()],
        '23514',
      );
      await insertSticker(
        runner,
        first.applicationId,
        first.inspectionId,
        'ABC123',
        new Date(),
        issuedByUserId,
      );
      await insertSticker(
        runner,
        second.applicationId,
        second.inspectionId,
        'abc123',
        new Date(),
        null,
      );
      await expectStickerError(
        runner,
        [
          first.applicationId,
          third.inspectionId,
          'DUPLICATE-APPLICATION',
          new Date(),
        ],
        '23505',
      );
      await expectStickerError(
        runner,
        [
          third.applicationId,
          first.inspectionId,
          'DUPLICATE-INSPECTION',
          new Date(),
        ],
        '23505',
      );
      await expectStickerError(
        runner,
        [third.applicationId, third.inspectionId, 'ABC123', new Date()],
        '23505',
      );
      // The completed-inspection immutability trigger rejects this before the
      // sticker FK is reached; either way PostgreSQL prevents deletion.
      await expectPostgresError(
        runner,
        () =>
          runner.query(`DELETE FROM "inspections" WHERE id = $1`, [
            first.inspectionId,
          ]),
        'P0001',
      );
      await expectPostgresError(
        runner,
        () =>
          runner.query(`DELETE FROM "renewal_applications" WHERE id = $1`, [
            first.applicationId,
          ]),
        '23503',
      );
      await runner.query(`DELETE FROM "users" WHERE id = $1`, [issuedByUserId]);
      expect(
        await runner.query(
          `SELECT issued_by_user_id FROM "stickers" WHERE application_id = $1`,
          [first.applicationId],
        ),
      ).toEqual([{ issued_by_user_id: null }]);
    });
  });

  it('refuses destructive evolution when a legacy sticker row exists', async () => {
    await inMigrationTransaction(dataSource, async (runner) => {
      const fixture = await createCompletedInspectionFixture(runner.manager);
      await runner.query(
        `INSERT INTO "stickers" (application_id, status) VALUES ($1, 'NOT_READY')`,
        [fixture.applicationId],
      );
      await expectPostgresError(
        runner,
        () => new EvolveStickersForIssuedInspection1786940836385().up(runner),
        'P0001',
      );
      expect(
        await runner.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stickers' AND column_name = 'status'`,
        ),
      ).toHaveLength(1);
    });
  });
});

async function inMigrationTransaction(
  dataSource: DataSource,
  test: (runner: QueryRunner) => Promise<void>,
): Promise<void> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await test(runner);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}

async function insertSticker(
  runner: QueryRunner,
  applicationId: string,
  inspectionId: string | null,
  stickerNumber: string | null,
  issuedAt: Date | null,
  issuedByUserId: string | null,
): Promise<void> {
  await runner.query(
    `INSERT INTO "stickers" (application_id, inspection_id, sticker_number, issued_at, issued_by_user_id) VALUES ($1, $2, $3, $4, $5)`,
    [applicationId, inspectionId, stickerNumber, issuedAt, issuedByUserId],
  );
}

async function expectStickerError(
  runner: QueryRunner,
  values: [string, string | null, string | null, Date | null],
  code: string,
): Promise<void> {
  await expectPostgresError(
    runner,
    () =>
      insertSticker(runner, values[0], values[1], values[2], values[3], null),
    code,
  );
}

async function expectPostgresError(
  runner: QueryRunner,
  operation: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await runner.query('SAVEPOINT expected_postgres_error');
  try {
    await operation();
    throw new Error(`Expected PostgreSQL error ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT expected_postgres_error');
  }
}

async function createCompletedInspectionFixture(
  manager: EntityManager,
): Promise<{ applicationId: string; inspectionId: string }> {
  const suffix = randomUUID().replaceAll('-', '');
  const citizenId = randomUUID();
  const adminId = randomUUID();
  const categoryId = randomUUID();
  const vehicleId = randomUUID();
  const applicationId = randomUUID();
  const stationId = randomUUID();
  const capacityId = randomUUID();
  const appointmentId = randomUUID();
  const inspectionId = randomUUID();
  await manager.getRepository(User).save([
    {
      id: citizenId,
      role: UserRole.CITIZEN,
      status: UserStatus.ACTIVE,
      phone: null,
      email: `p7-c-${suffix}@test`,
      passwordHash: 'test',
      phoneVerifiedAt: null,
      emailVerifiedAt: new Date(),
      lastLoginAt: null,
    },
    {
      id: adminId,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      phone: null,
      email: `p7-a-${suffix}@test`,
      passwordHash: 'test',
      phoneVerifiedAt: null,
      emailVerifiedAt: new Date(),
      lastLoginAt: null,
    },
  ]);
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
    plateNumber: suffix.slice(0, 8),
    plateCategory: VehiclePlateCategory.PROVINCE,
    plateProvince: 'Phnom Penh',
    plateType: 'PRIVATE',
    vehicleType: 'CAR',
    vehicleClass: VehicleClass.LIGHT,
    inspectionCategoryId: categoryId,
    classificationVerifiedAt: new Date(),
    classificationVerifiedBy: adminId,
    make: 'Test',
    model: 'Test',
    manufactureYear: 2020,
    chassisNumber: `C-${suffix}`,
    firstRegistrationDate: '2020-01-01',
    lastInspectionDate: null,
    inspectionExpiryDate: '2026-08-17',
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
    capacityDate: '2026-08-17',
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
    applicantSnapshot: null,
    vehicleSnapshot: null,
    currentCorrectionReason: null,
    currentRejectionReason: null,
    preferredInspectionStationId: stationId,
    preferredInspectionDate: '2026-08-17',
    submittedAt: new Date(),
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
  });
  await manager.getRepository(Appointment).save({
    id: appointmentId,
    applicationId,
    slotId: null,
    dailyCapacityId: capacityId,
    status: AppointmentStatus.COMPLETED,
    completedAt: new Date(),
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    noShowMarkedAt: null,
    noShowMarkedByUserId: null,
  });
  await manager.getRepository(Inspection).save({
    id: inspectionId,
    applicationId,
    appointmentId,
    attemptNumber: 1,
    status: InspectionStatus.COMPLETED,
    result: InspectionResult.PASS,
    recordedByUserId: adminId,
    startedAt: null,
    completedAt: new Date(),
    failureReason: null,
    notes: null,
  });
  return { applicationId, inspectionId };
}
