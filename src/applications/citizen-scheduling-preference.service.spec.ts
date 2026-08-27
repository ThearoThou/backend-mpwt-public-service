import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { CitizenPreferredSchedulingService } from '../scheduling/citizen-preferred-scheduling.service';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { CitizenSchedulingPreferenceService } from './citizen-scheduling-preference.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const APPLICATION_ID = '33333333-3333-4333-8333-333333333333';
const STATION_ID = '44444444-4444-4444-8444-444444444444';
const DATE = '2026-08-12';

describe('CitizenSchedulingPreferenceService', () => {
  it('accepts a required preferred date with no station and does not use capacity', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.updateDraftPreference(CITIZEN_ID, APPLICATION_ID, {
        preferredInspectionDate: DATE,
        preferredInspectionStationId: null,
      }),
    ).resolves.toBe(fixture.application);

    expect(
      fixture.preferredScheduling.validatePreferredDate,
    ).toHaveBeenCalledWith(DATE);
    expect(
      fixture.preferredScheduling.validateOptionalStationWithManager,
    ).toHaveBeenCalledWith(fixture.manager, null);
    expect(fixture.application).toMatchObject({
      preferredInspectionDate: DATE,
      preferredInspectionStationId: null,
      status: ApplicationStatus.DRAFT,
    });
  });

  it('accepts an active selected station as an optional preference', async () => {
    const fixture = createFixture();

    await fixture.service.updateDraftPreference(CITIZEN_ID, APPLICATION_ID, {
      preferredInspectionDate: DATE,
      preferredInspectionStationId: STATION_ID,
    });

    expect(
      fixture.preferredScheduling.validateOptionalStationWithManager,
    ).toHaveBeenCalledWith(fixture.manager, STATION_ID);
    expect(fixture.application.preferredInspectionStationId).toBe(STATION_ID);
  });

  it('does not persist an inactive station preference', async () => {
    const fixture = createFixture();
    fixture.preferredScheduling.validateOptionalStationWithManager.mockRejectedValue(
      Object.assign(new Error('station inactive'), {
        code: ApiErrorCode.STATION_NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      }),
    );

    await expect(
      fixture.service.updateDraftPreference(CITIZEN_ID, APPLICATION_ID, {
        preferredInspectionDate: DATE,
        preferredInspectionStationId: STATION_ID,
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.STATION_NOT_FOUND });
    expect(fixture.applications.save).not.toHaveBeenCalled();
  });

  it.each([ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW])(
    'rejects changes after first submission (%s)',
    async (status) => {
      const fixture = createFixture({ status });
      await expect(
        fixture.service.updateDraftPreference(CITIZEN_ID, APPLICATION_ID, {
          preferredInspectionDate: DATE,
          preferredInspectionStationId: null,
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        status: HttpStatus.CONFLICT,
      });
    },
  );

  it('requires citizen ownership before changing a draft', async () => {
    const fixture = createFixture({ citizenId: OTHER_CITIZEN_ID });
    await expect(
      fixture.service.updateDraftPreference(CITIZEN_ID, APPLICATION_ID, {
        preferredInspectionDate: DATE,
        preferredInspectionStationId: null,
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.RESOURCE_NOT_OWNED });
  });
});

function createFixture(overrides: Partial<RenewalApplication> = {}) {
  const application = applicationRecord(overrides);
  const applications = {
    findOne: jest.fn().mockResolvedValue(application),
    save: jest.fn().mockResolvedValue(application),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === RenewalApplication) return applications;
      throw new Error('Unexpected repository');
    }),
  };
  const dataSource = {
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const preferredScheduling = {
    validatePreferredDate: jest.fn(),
    validateOptionalStationWithManager: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new CitizenSchedulingPreferenceService(
      dataSource as unknown as DataSource,
      preferredScheduling as unknown as CitizenPreferredSchedulingService,
    ),
    application,
    applications,
    manager,
    preferredScheduling,
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
