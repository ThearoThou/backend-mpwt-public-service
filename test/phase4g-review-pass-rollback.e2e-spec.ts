import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { EntitySubscriberInterface } from 'typeorm';

import { AdminApplicationReviewService } from '../src/applications/admin-application-review.service';
import { CitizenSchedulingPreferenceService } from '../src/applications/citizen-scheduling-preference.service';
import { RenewalApplicationStatusHistory } from '../src/applications/entities/renewal-application-status-history.entity';
import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import dataSource from '../src/database/data-source';
import { Appointment } from '../src/scheduling/entities/appointment.entity';
import { CitizenSchedulingAvailabilityService } from '../src/scheduling/citizen-scheduling-availability.service';
import { InspectionStationDailyCapacity } from '../src/scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { AppointmentStatus } from '../src/scheduling/enums/appointment-status.enum';
import { InspectionStationDailyCapacityService } from '../src/scheduling/inspection-station-daily-capacity.service';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { Vehicle } from '../src/vehicles/entities/vehicle.entity';
import { VehiclePlateCategory } from '../src/vehicles/enums/vehicle-plate-category.enum';

describe('Phase 4G review-pass rollback (PostgreSQL)', () => {
  const ids = {
    adminId: randomUUID(),
    citizenId: randomUUID(),
    vehicleId: randomUUID(),
    stationId: randomUUID(),
    dailyCapacityId: randomUUID(),
    applicationId: randomUUID(),
  };
  const suffix = randomUUID().replaceAll('-', '');
  const plateNumber = `1A-${String(Date.now() % 10000).padStart(4, '0')}`;
  let capacityDate: string;

  beforeAll(async () => {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    const [today] = await dataSource.query<Array<{ capacityDate: string }>>(
      `
        SELECT (
          ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date + 1)::text
        ) AS "capacityDate"
      `,
    );
    capacityDate = today.capacityDate;

    await dataSource.getRepository(User).save([
      {
        id: ids.adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        phone: null,
        email: `phase4g-admin-${suffix}@example.test`,
        passwordHash: 'test-password-hash',
        phoneVerifiedAt: null,
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
      },
      {
        id: ids.citizenId,
        role: UserRole.CITIZEN,
        status: UserStatus.ACTIVE,
        phone: null,
        email: `phase4g-citizen-${suffix}@example.test`,
        passwordHash: 'test-password-hash',
        phoneVerifiedAt: null,
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
      },
    ]);
    await dataSource.getRepository(Vehicle).save({
      id: ids.vehicleId,
      linkedCitizenId: ids.citizenId,
      registrationNumber: `P4G-${suffix.slice(0, 12)}`,
      plateNumber,
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: 'Phnom Penh',
      plateType: 'PRIVATE',
      vehicleType: 'SEDAN',
      vehicleClass: null,
      inspectionCategoryId: null,
      classificationVerifiedAt: null,
      classificationVerifiedBy: null,
      make: 'Test',
      model: 'Rollback',
      manufactureYear: 2020,
      chassisNumber: `P4G-CHASSIS-${suffix}`,
      firstRegistrationDate: '2020-01-01',
      lastInspectionDate: null,
      inspectionExpiryDate: '2027-01-01',
      registeredOwnerNameKh: 'Test Owner',
      registeredOwnerNameEn: 'Test Owner',
      registeredOwnerPhone: '010000000',
      isActive: true,
    });
    await dataSource.getRepository(InspectionStation).save({
      id: ids.stationId,
      code: `P4G-${suffix.slice(0, 16).toUpperCase()}`,
      nameKh: 'Test station',
      nameEn: 'Test station',
      province: 'Phnom Penh',
      address: 'Test address',
      phone: null,
      isActive: true,
    });
    await dataSource.getRepository(InspectionStationDailyCapacity).save({
      id: ids.dailyCapacityId,
      stationId: ids.stationId,
      capacityDate,
      dailyCapacity: 1,
      reservedCount: 0,
      isClosed: false,
    });
    await dataSource.getRepository(RenewalApplication).save({
      id: ids.applicationId,
      citizenId: ids.citizenId,
      vehicleId: ids.vehicleId,
      referenceNumber: `VIR-P4G-${suffix.slice(0, 16).toUpperCase()}`,
      status: ApplicationStatus.UNDER_REVIEW,
      applicantSnapshot: {},
      vehicleSnapshot: {},
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: ids.stationId,
      preferredInspectionDate: capacityDate,
      submittedAt: new Date(),
      reviewStartedAt: new Date(),
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
    });
  });

  afterAll(async () => {
    if (!dataSource.isInitialized) {
      return;
    }

    await dataSource.transaction(async (manager) => {
      await manager.delete(RenewalApplicationStatusHistory, {
        applicationId: ids.applicationId,
      });
      await manager.delete(Appointment, { applicationId: ids.applicationId });
      await manager.delete(RenewalApplication, { id: ids.applicationId });
      await manager.delete(InspectionStationDailyCapacity, {
        id: ids.dailyCapacityId,
      });
      await manager.delete(InspectionStation, { id: ids.stationId });
      await manager.delete(Vehicle, { id: ids.vehicleId });
      await manager.delete(User, [ids.adminId, ids.citizenId]);
    });
    await dataSource.destroy();
  });

  it('rolls back the reservation when a real appointment insert subscriber fails', async () => {
    const forcedFailure = new Error('force appointment insert failure');
    const subscriber: EntitySubscriberInterface<Appointment> = {
      listen: () => Appointment,
      afterInsert: () => {
        throw forcedFailure;
      },
    };
    dataSource.subscribers.push(subscriber);

    const dailyCapacities = new InspectionStationDailyCapacityService(
      dataSource.getRepository(InspectionStationDailyCapacity),
      dataSource.getRepository(InspectionStation),
    );
    const service = new AdminApplicationReviewService(
      dataSource,
      dailyCapacities,
    );

    try {
      await expect(
        service.passReview(ids.adminId, ids.applicationId),
      ).rejects.toBe(forcedFailure);
    } finally {
      dataSource.subscribers.splice(
        dataSource.subscribers.indexOf(subscriber),
        1,
      );
    }

    const capacity = await dataSource
      .getRepository(InspectionStationDailyCapacity)
      .findOneByOrFail({ id: ids.dailyCapacityId });
    const application = await dataSource
      .getRepository(RenewalApplication)
      .findOneByOrFail({ id: ids.applicationId });
    const scheduledAppointments = await dataSource
      .getRepository(Appointment)
      .countBy({
        applicationId: ids.applicationId,
        status: AppointmentStatus.SCHEDULED,
      });
    const approvedHistory = await dataSource
      .getRepository(RenewalApplicationStatusHistory)
      .countBy({
        applicationId: ids.applicationId,
        previousStatus: ApplicationStatus.UNDER_REVIEW,
        newStatus: ApplicationStatus.APPROVED,
      });

    expect(capacity.reservedCount).toBe(0);
    expect(application.status).toBe(ApplicationStatus.UNDER_REVIEW);
    expect(scheduledAppointments).toBe(0);
    expect(approvedHistory).toBe(0);
  });

  it('rolls back the citizen replacement selection when a real appointment insert subscriber fails', async () => {
    const originalDate = '2099-01-01';
    await dataSource.getRepository(RenewalApplication).update(
      { id: ids.applicationId },
      {
        status: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
        preferredInspectionDate: originalDate,
      },
    );
    const forcedFailure = new Error('force citizen appointment insert failure');
    const subscriber: EntitySubscriberInterface<Appointment> = {
      listen: () => Appointment,
      afterInsert: () => {
        throw forcedFailure;
      },
    };
    dataSource.subscribers.push(subscriber);
    const dailyCapacities = new InspectionStationDailyCapacityService(
      dataSource.getRepository(InspectionStationDailyCapacity),
      dataSource.getRepository(InspectionStation),
    );
    const service = new CitizenSchedulingPreferenceService(
      dataSource,
      new CitizenSchedulingAvailabilityService(
        dataSource.getRepository(InspectionStation),
        dataSource.getRepository(InspectionStationDailyCapacity),
      ),
      dailyCapacities,
    );

    try {
      await expect(
        service.reserveAppointmentSelection(ids.citizenId, ids.applicationId, {
          stationId: ids.stationId,
          capacityDate,
        }),
      ).rejects.toBe(forcedFailure);
    } finally {
      dataSource.subscribers.splice(
        dataSource.subscribers.indexOf(subscriber),
        1,
      );
    }

    const capacity = await dataSource
      .getRepository(InspectionStationDailyCapacity)
      .findOneByOrFail({ id: ids.dailyCapacityId });
    const application = await dataSource
      .getRepository(RenewalApplication)
      .findOneByOrFail({ id: ids.applicationId });
    expect(capacity.reservedCount).toBe(0);
    expect(application).toMatchObject({
      status: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
      preferredInspectionStationId: ids.stationId,
      preferredInspectionDate: originalDate,
    });
    await expect(
      dataSource.getRepository(Appointment).countBy({
        applicationId: ids.applicationId,
        status: AppointmentStatus.SCHEDULED,
      }),
    ).resolves.toBe(0);
    await expect(
      dataSource.getRepository(RenewalApplicationStatusHistory).countBy({
        applicationId: ids.applicationId,
        previousStatus: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
        newStatus: ApplicationStatus.APPROVED,
      }),
    ).resolves.toBe(0);
  });
});
