import 'reflect-metadata';

import { HttpStatus, Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { CitizenSchedulingAvailabilityService } from '../scheduling/citizen-scheduling-availability.service';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStationDailyCapacityService } from '../scheduling/inspection-station-daily-capacity.service';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { CitizenSchedulingPreferenceService } from './citizen-scheduling-preference.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const APPLICATION_ID = '33333333-3333-4333-8333-333333333333';
const STATION_ID = '44444444-4444-4444-8444-444444444444';
const DATE = '2026-08-12';

describe('CitizenSchedulingPreferenceService', () => {
  it('updates both DRAFT preference fields together after availability validation', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.updateDraftPreference(
        CITIZEN_ID,
        APPLICATION_ID,
        input(),
      ),
    ).resolves.toBe(fixture.application);
    expect(
      fixture.availability.validateSelectableWithManager,
    ).toHaveBeenCalledWith(fixture.manager, STATION_ID, DATE);
    expect(fixture.application).toMatchObject({
      preferredInspectionStationId: STATION_ID,
      preferredInspectionDate: DATE,
      status: ApplicationStatus.DRAFT,
    });
    expect(fixture.applications.save).toHaveBeenCalledWith(fixture.application);
  });

  it('allows a DRAFT preference to change as another complete pair', async () => {
    const fixture = createFixture({
      preferredInspectionStationId: 'old-station',
      preferredInspectionDate: '2026-08-11',
    });

    await fixture.service.updateDraftPreference(CITIZEN_ID, APPLICATION_ID, {
      stationId: STATION_ID,
      capacityDate: DATE,
    });

    expect(fixture.application).toMatchObject({
      preferredInspectionStationId: STATION_ID,
      preferredInspectionDate: DATE,
    });
  });

  it.each([ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW])(
    'rejects changing a preference after first submission (%s)',
    async (status) => {
      const fixture = createFixture({ status });

      await expect(
        fixture.service.updateDraftPreference(
          CITIZEN_ID,
          APPLICATION_ID,
          input(),
        ),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        status: HttpStatus.CONFLICT,
      });
      expect(
        fixture.availability.validateSelectableWithManager,
      ).not.toHaveBeenCalled();
      expect(fixture.applications.save).not.toHaveBeenCalled();
    },
  );

  it('rejects unavailable DRAFT choices without a preference write or reservation', async () => {
    const fixture = createFixture();
    fixture.availability.validateSelectableWithManager.mockRejectedValue(
      new Error('not selectable'),
    );

    await expect(
      fixture.service.updateDraftPreference(
        CITIZEN_ID,
        APPLICATION_ID,
        input(),
      ),
    ).rejects.toThrow('not selectable');
    expect(fixture.applications.save).not.toHaveBeenCalled();
    expect(fixture.application.reservedCount).toBeUndefined();
    expect(fixture.application.status).toBe(ApplicationStatus.DRAFT);
  });

  it('requires citizen ownership before changing a DRAFT preference', async () => {
    const fixture = createFixture({ citizenId: OTHER_CITIZEN_ID });

    await expect(
      fixture.service.updateDraftPreference(
        CITIZEN_ID,
        APPLICATION_ID,
        input(),
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });
    expect(fixture.applications.save).not.toHaveBeenCalled();
  });

  it('validates an APPOINTMENT_SELECTION_REQUIRED replacement without persisting or reserving it', async () => {
    const fixture = createFixture({
      status: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
    });

    await expect(
      fixture.service.validateAppointmentSelectionRequired(
        CITIZEN_ID,
        APPLICATION_ID,
        input(),
      ),
    ).resolves.toBeUndefined();
    expect(
      fixture.availability.validateSelectableWithManager,
    ).toHaveBeenCalledWith(fixture.manager, STATION_ID, DATE);
    expect(fixture.applications.save).not.toHaveBeenCalled();
    expect(fixture.application.status).toBe(
      ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
    );
  });

  it('rejects replacement selection for any status other than APPOINTMENT_SELECTION_REQUIRED', async () => {
    const fixture = createFixture({ status: ApplicationStatus.DRAFT });

    await expect(
      fixture.service.validateAppointmentSelectionRequired(
        CITIZEN_ID,
        APPLICATION_ID,
        input(),
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.applications.save).not.toHaveBeenCalled();
  });

  it('atomically reserves the citizen selection, creates a daily appointment, and approves with citizen history', async () => {
    const fixture = createFixture({
      status: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
      preferredInspectionStationId: 'old-station',
      preferredInspectionDate: '2026-08-11',
    });

    await fixture.service.reserveAppointmentSelection(
      CITIZEN_ID,
      APPLICATION_ID,
      input(),
    );

    expect(
      fixture.dailyCapacities.reserveDailyCapacityWithManager,
    ).toHaveBeenCalledWith(fixture.manager, STATION_ID, DATE);
    expect(fixture.appointments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APPLICATION_ID,
        slotId: null,
        dailyCapacity: fixture.dailyCapacity,
        status: AppointmentStatus.SCHEDULED,
      }),
    );
    expect(fixture.application).toMatchObject({
      preferredInspectionStationId: STATION_ID,
      preferredInspectionDate: DATE,
      status: ApplicationStatus.APPROVED,
    });
    expect(fixture.history.create).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      previousStatus: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
      newStatus: ApplicationStatus.APPROVED,
      changedByUserId: CITIZEN_ID,
    });
    expect(fixture.payments.initializePayment).toHaveBeenCalledWith(
      APPLICATION_ID,
    );
  });

  it('keeps the old selection and status when reservation is unavailable', async () => {
    const fixture = createFixture({
      status: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
      preferredInspectionStationId: 'old-station',
      preferredInspectionDate: '2026-08-11',
    });
    fixture.dailyCapacities.reserveDailyCapacityWithManager.mockResolvedValue(
      null,
    );

    await expect(
      fixture.service.reserveAppointmentSelection(
        CITIZEN_ID,
        APPLICATION_ID,
        input(),
      ),
    ).rejects.toMatchObject({ code: ApiErrorCode.CONFLICT });
    expect(fixture.appointments.save).not.toHaveBeenCalled();
    expect(fixture.applications.save).not.toHaveBeenCalled();
    expect(fixture.history.save).not.toHaveBeenCalled();
    expect(fixture.application).toMatchObject({
      preferredInspectionStationId: 'old-station',
      preferredInspectionDate: '2026-08-11',
      status: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
    });
    expect(fixture.payments.initializePayment).not.toHaveBeenCalled();
  });

  it('keeps the committed appointment-selection response when payment initialization fails', async () => {
    const fixture = createFixture({
      status: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
    });
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    fixture.payments.initializePayment.mockRejectedValue(
      new Error('invoice generation failed'),
    );

    await expect(
      fixture.service.reserveAppointmentSelection(
        CITIZEN_ID,
        APPLICATION_ID,
        input(),
      ),
    ).resolves.toMatchObject({ status: ApplicationStatus.APPROVED });
    expect(fixture.payments.initializePayment).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining(APPLICATION_ID),
      expect.any(String),
    );
    loggerError.mockRestore();
  });
});

function createFixture(overrides: Partial<RenewalApplication> = {}) {
  const application = applicationRecord(overrides);
  const applications = {
    findOne: jest.fn().mockResolvedValue(application),
    save: jest.fn().mockResolvedValue(application),
  };
  const appointments = {
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const history = {
    create: jest.fn((value: Record<string, unknown>) => value),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const dailyCapacity = capacity();
  const dailyCapacityRecords = {
    findOneByOrFail: jest.fn().mockResolvedValue(dailyCapacity),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === RenewalApplication) return applications;
      if (entity === Appointment) return appointments;
      if (entity === RenewalApplicationStatusHistory) return history;
      if (entity === InspectionStationDailyCapacity)
        return dailyCapacityRecords;
      throw new Error('Unexpected repository');
    }),
  };
  const dataSource = {
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const availability = {
    validateSelectableWithManager: jest.fn().mockResolvedValue(capacity()),
  };
  const dailyCapacities = {
    reserveDailyCapacityWithManager: jest.fn().mockResolvedValue({
      id: dailyCapacity.id,
      stationId: STATION_ID,
      capacityDate: DATE,
    }),
  };
  const payments = { initializePayment: jest.fn().mockResolvedValue({}) };

  return {
    service: new CitizenSchedulingPreferenceService(
      dataSource as unknown as DataSource,
      availability as unknown as CitizenSchedulingAvailabilityService,
      dailyCapacities as unknown as InspectionStationDailyCapacityService,
      payments as never,
    ),
    application,
    applications,
    manager,
    availability,
    dailyCapacities,
    appointments,
    history,
    payments,
    dailyCapacity,
  };
}

function applicationRecord(
  overrides: Partial<RenewalApplication>,
): RenewalApplication {
  return {
    id: APPLICATION_ID,
    citizenId: CITIZEN_ID,
    vehicleId: 'vehicle-id',
    status: ApplicationStatus.DRAFT,
    referenceNumber: null,
    applicantSnapshot: null,
    vehicleSnapshot: null,
    currentCorrectionReason: null,
    currentRejectionReason: null,
    preferredInspectionStationId: null,
    preferredInspectionDate: null,
    submittedAt: null,
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function capacity(): InspectionStationDailyCapacity {
  return {
    id: 'daily-capacity-id',
    stationId: STATION_ID,
    capacityDate: DATE,
    dailyCapacity: 30,
    reservedCount: 0,
    isClosed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function input() {
  return { stationId: STATION_ID, capacityDate: DATE };
}
