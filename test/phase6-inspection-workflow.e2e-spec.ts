import 'reflect-metadata';

import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import { Payment } from '../src/payments/entities/payment.entity';
import { PaymentMethod } from '../src/payments/enums/payment-method.enum';
import { PaymentStatus } from '../src/payments/enums/payment-status.enum';
import { Appointment } from '../src/scheduling/entities/appointment.entity';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { InspectionStationDailyCapacity } from '../src/scheduling/entities/inspection-station-daily-capacity.entity';
import { AppointmentStatus } from '../src/scheduling/enums/appointment-status.enum';
import { InspectionCommandsService } from '../src/inspections/inspection-commands.service';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';
import { Inspection } from '../src/inspections/entities/inspection.entity';
import { InspectionResult } from '../src/inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../src/inspections/enums/inspection-status.enum';
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

interface CambodiaDates {
  today: string;
  yesterday: string;
  tomorrow: string;
  thirtyOneDaysAgo: string;
}

describe('Phase 6 physical inspection workflow (PostgreSQL)', () => {
  let dataSource: DataSource;
  let dates: CambodiaDates;

  beforeAll(async () => {
    dataSource = await initializeApprovedE2eDataSource();
    await assertApprovedE2eDatabase(dataSource, loadE2eEnvironment());
    const [clock] = await dataSource.query<CambodiaDates[]>(`
      SELECT
        cambodia_date::text AS "today",
        (cambodia_date - 1)::text AS "yesterday",
        (cambodia_date + 1)::text AS "tomorrow",
        (cambodia_date - 31)::text AS "thirtyOneDaysAgo"
      FROM (SELECT (now() AT TIME ZONE 'Asia/Phnom_Penh')::date AS cambodia_date) clock
    `);
    if (clock === undefined) throw new Error('Cambodia E2E clock unavailable');
    dates = clock;
  });

  afterAll(async () => {
    if (e2eDataSource.isInitialized) await e2eDataSource.destroy();
  });

  describe('Migration 11 schema guards', () => {
    it('uses the guarded PostgreSQL database and exposes Phase 6 constraints', async () => {
      const [database] = await dataSource.query<
        Array<{ currentDatabase: string }>
      >('SELECT current_database() AS "currentDatabase"');
      expect(database?.currentDatabase).toBe(
        'mpwt_vehicle_inspection_renewal_e2e',
      );
      expect(dates.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const constraints = await dataSource.query<Array<{ conname: string }>>(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'inspections'::regclass",
      );
      expect(constraints.map(({ conname }) => conname)).toEqual(
        expect.arrayContaining([
          'chk_inspections_attempt_number',
          'uq_inspections_application_attempt',
          'chk_inspections_state_consistency',
          'chk_inspections_result_failure_reason',
        ]),
      );
      const triggers = await dataSource.query<Array<{ tgname: string }>>(
        "SELECT tgname FROM pg_trigger WHERE tgrelid = 'inspections'::regclass AND NOT tgisinternal",
      );
      expect(triggers.map(({ tgname }) => tgname)).toContain(
        'trg_guard_completed_inspection_immutable',
      );
    });
  });

  describe('Attempt 1 PASS', () => {
    it('records a completed PASS through the real command transaction', async () => {
      const fixture = await createPassFixture(dataSource, dates.today);
      const capacityBefore = await dataSource
        .getRepository(InspectionStationDailyCapacity)
        .findOneByOrFail({ id: fixture.capacityId });

      await new InspectionCommandsService(dataSource).recordResult(
        fixture.appointmentId,
        fixture.adminId,
        { result: InspectionResult.PASS, failureReason: null },
      );

      const [inspection, appointment, application, payment, capacity, history] =
        await Promise.all([
          dataSource
            .getRepository(Inspection)
            .find({ where: { applicationId: fixture.applicationId } }),
          dataSource
            .getRepository(Appointment)
            .findOneByOrFail({ id: fixture.appointmentId }),
          dataSource
            .getRepository(RenewalApplication)
            .findOneByOrFail({ id: fixture.applicationId }),
          dataSource
            .getRepository(Payment)
            .find({ where: { applicationId: fixture.applicationId } }),
          dataSource
            .getRepository(InspectionStationDailyCapacity)
            .findOneByOrFail({ id: fixture.capacityId }),
          dataSource.query<Array<{ count: string }>>(
            'SELECT count(*)::text AS count FROM renewal_application_status_history WHERE application_id = $1',
            [fixture.applicationId],
          ),
        ]);
      expect(inspection).toHaveLength(1);
      expect(inspection[0]).toMatchObject({
        appointmentId: fixture.appointmentId,
        attemptNumber: 1,
        status: InspectionStatus.COMPLETED,
        result: InspectionResult.PASS,
        failureReason: null,
        recordedByUserId: fixture.adminId,
      });
      expect(inspection[0]?.completedAt).not.toBeNull();
      expect(appointment).toMatchObject({
        status: AppointmentStatus.COMPLETED,
      });
      expect(appointment.completedAt).not.toBeNull();
      expect(application.status).toBe(ApplicationStatus.APPROVED);
      expect(payment).toHaveLength(1);
      expect(payment[0]).toMatchObject({
        id: fixture.paymentId,
        status: PaymentStatus.CONFIRMED,
      });
      expect(capacity.reservedCount).toBe(capacityBefore.reservedCount);
      expect(history[0]?.count).toBe('0');
    });
  });

  describe('Attempt 1 FAIL', () => {
    it('records a completed FAIL without changing the application terminal status', async () => {
      const fixture = await createPassFixture(dataSource, dates.today);
      const capacityBefore = await dataSource
        .getRepository(InspectionStationDailyCapacity)
        .findOneByOrFail({ id: fixture.capacityId });

      await new InspectionCommandsService(dataSource).recordResult(
        fixture.appointmentId,
        fixture.adminId,
        {
          result: InspectionResult.FAIL,
          failureReason: 'Brake performance below required threshold',
        },
      );

      const [
        inspections,
        appointment,
        application,
        payments,
        capacity,
        history,
      ] = await Promise.all([
        dataSource
          .getRepository(Inspection)
          .find({ where: { applicationId: fixture.applicationId } }),
        dataSource
          .getRepository(Appointment)
          .findOneByOrFail({ id: fixture.appointmentId }),
        dataSource
          .getRepository(RenewalApplication)
          .findOneByOrFail({ id: fixture.applicationId }),
        dataSource
          .getRepository(Payment)
          .find({ where: { applicationId: fixture.applicationId } }),
        dataSource
          .getRepository(InspectionStationDailyCapacity)
          .findOneByOrFail({ id: fixture.capacityId }),
        dataSource.query<Array<{ count: string }>>(
          'SELECT count(*)::text AS count FROM renewal_application_status_history WHERE application_id = $1',
          [fixture.applicationId],
        ),
      ]);
      expect(inspections).toHaveLength(1);
      expect(inspections[0]).toMatchObject({
        appointmentId: fixture.appointmentId,
        attemptNumber: 1,
        status: InspectionStatus.COMPLETED,
        result: InspectionResult.FAIL,
        failureReason: 'Brake performance below required threshold',
        recordedByUserId: fixture.adminId,
      });
      expect(inspections[0]?.completedAt).not.toBeNull();
      expect(appointment.status).toBe(AppointmentStatus.COMPLETED);
      expect(appointment.completedAt).not.toBeNull();
      expect(application.status).toBe(ApplicationStatus.APPROVED);
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        id: fixture.paymentId,
        status: PaymentStatus.CONFIRMED,
      });
      expect(capacity.reservedCount).toBe(capacityBefore.reservedCount);
      expect(history[0]?.count).toBe('0');
    });
  });
});

async function createPassFixture(dataSource: DataSource, today: string) {
  const suffix = randomUUID().replaceAll('-', '');
  const citizenId = randomUUID();
  const adminId = randomUUID();
  const categoryId = randomUUID();
  const vehicleId = randomUUID();
  const applicationId = randomUUID();
  const stationId = randomUUID();
  const capacityId = randomUUID();
  const appointmentId = randomUUID();
  const paymentId = randomUUID();
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(User).save([
      {
        id: citizenId,
        role: UserRole.CITIZEN,
        status: UserStatus.ACTIVE,
        phone: null,
        email: `p6-c-${suffix}@test`,
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
        email: `p6-a-${suffix}@test`,
        passwordHash: 'test',
        phoneVerifiedAt: null,
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
      },
    ]);
    await manager.getRepository(InspectionVehicleCategory).save({
      id: categoryId,
      code: `P6-${suffix}`,
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
      registrationNumber: `P6-${suffix}`,
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
      inspectionExpiryDate: today,
      registeredOwnerNameKh: 'test',
      registeredOwnerNameEn: 'test',
      registeredOwnerPhone: '012345678',
      isActive: true,
    });
    await manager.getRepository(InspectionStation).save({
      id: stationId,
      code: `P6-${suffix.slice(0, 10)}`,
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
      capacityDate: today,
      dailyCapacity: 2,
      reservedCount: 1,
      isClosed: false,
    });
    await manager.getRepository(RenewalApplication).save({
      id: applicationId,
      referenceNumber: `P6-${suffix}`,
      citizenId,
      vehicleId,
      status: ApplicationStatus.APPROVED,
      applicantSnapshot: null,
      vehicleSnapshot: null,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: stationId,
      preferredInspectionDate: today,
      submittedAt: new Date(),
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
    });
    await manager.getRepository(Payment).save({
      id: paymentId,
      applicationId,
      invoiceNumber: `INV-${suffix}`,
      receiptNumber: null,
      method: PaymentMethod.PAY_AT_STATION,
      status: PaymentStatus.CONFIRMED,
      baseAmount: '1.00',
      inspectionFeeKhr: '1.00',
      serviceFeeKhr: '0.00',
      lateFee: '0.00',
      totalAmount: '1.00',
      currency: 'KHR',
      paymentReference: 'PASS',
      providerName: null,
      providerTransactionId: null,
      confirmedByUserId: adminId,
      confirmedAt: new Date(),
      failedAt: null,
      failureReason: null,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectionReason: null,
      invoiceFileKey: null,
      receiptFileKey: null,
      inspectionSheetFileKey: null,
      previousInspectionExpiryDate: today,
      lateDays: 0,
    });
    await manager.getRepository(Appointment).save({
      id: appointmentId,
      applicationId,
      slotId: null,
      dailyCapacityId: capacityId,
      status: AppointmentStatus.SCHEDULED,
      completedAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      noShowMarkedAt: null,
      noShowMarkedByUserId: null,
    });
  });
  return {
    citizenId,
    adminId,
    applicationId,
    capacityId,
    appointmentId,
    paymentId,
  };
}
