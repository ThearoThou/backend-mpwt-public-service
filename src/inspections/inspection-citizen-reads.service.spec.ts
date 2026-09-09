import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { InspectionResult } from './enums/inspection-result.enum';
import { InspectionValidityRule } from './enums/inspection-validity-rule.enum';
import { InspectionReadsService } from './inspection-reads.service';

describe('InspectionReadsService citizen reads', () => {
  it('returns not found for an application outside the citizen scope', async () => {
    const service = new InspectionReadsService({
      query: jest.fn().mockResolvedValue([]),
    } as never);

    await expect(
      service.getCitizenApplicationStatus('citizen-a', 'application-b'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('maps PASS as sticker eligible and an attempt-one FAIL as reinspection-required', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        statusRow({
          inspectionId: 'inspection-id',
          inspectionAttemptNumber: 1,
          inspectionResult: InspectionResult.PASS,
          inspectedAt: new Date(),
          validUntil: '2028-08-14',
          validityRule:
            InspectionValidityRule.FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL,
          attemptsUsed: 1,
          completedPassCount: 1,
        }),
      ])
      .mockResolvedValueOnce([
        statusRow({
          inspectionId: 'inspection-id',
          inspectionAttemptNumber: 1,
          inspectionResult: InspectionResult.FAIL,
          failureReason: 'Brake issue',
          inspectedAt: new Date(),
          attemptsUsed: 1,
          firstFailDate: '2026-09-13',
        }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      stickerEligible: true,
      attemptsUsed: 1,
      attemptsRemaining: 1,
      reinspectionRequired: false,
      inspection: {
        validUntil: '2028-08-14',
        validityRule:
          InspectionValidityRule.FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL,
      },
    });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      stickerEligible: false,
      reinspectionRequired: true,
      reinspectionDeadline: '2026-09-13',
      replacementBookingRequired: true,
    });
  });

  it('keeps NO_SHOW separate from attempts and preserves the prior FAIL deadline', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        statusRow({
          latestAppointmentStatus: AppointmentStatus.NO_SHOW,
          firstNoShowDate: '2026-09-12',
        }),
      ])
      .mockResolvedValueOnce([
        statusRow({
          latestAppointmentStatus: AppointmentStatus.NO_SHOW,
          inspectionId: 'inspection-id',
          inspectionAttemptNumber: 1,
          inspectionResult: InspectionResult.FAIL,
          inspectedAt: new Date(),
          attemptsUsed: 1,
          firstFailDate: '2026-09-10',
          firstNoShowDate: '2026-09-12',
        }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      inspection: null,
      attemptsUsed: 0,
      attemptsRemaining: 2,
      replacementBookingRequired: true,
      replacementBookingDeadline: '2026-09-12',
    });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      attemptsUsed: 1,
      reinspectionRequired: true,
      reinspectionDeadline: '2026-09-10',
      replacementBookingDeadline: null,
    });
  });

  it('does not advertise actions for terminal application states', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        statusRow({ applicationStatus: ApplicationStatus.CANCELLED }),
      ])
      .mockResolvedValueOnce([
        statusRow({
          applicationStatus: ApplicationStatus.INSPECTION_FAILED,
          attemptsUsed: 1,
          firstFailDate: '2026-09-10',
        }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      replacementBookingRequired: false,
      reinspectionRequired: false,
      stickerEligible: false,
    });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      attemptsRemaining: 1,
      reinspectionRequired: false,
    });
  });

  it('does not advertise Phase 6 actions for non-approved applications with historical FAIL or NO_SHOW data', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        failRow({
          applicationStatus: ApplicationStatus.REJECTED,
          firstFailDate: '2026-08-15',
        }),
      ])
      .mockResolvedValueOnce([
        noShowRow({
          applicationStatus: ApplicationStatus.CORRECTION_REQUIRED,
          firstNoShowDate: '2026-08-15',
        }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      reinspectionRequired: false,
      reinspectionDeadline: null,
      replacementBookingRequired: false,
      replacementBookingDeadline: null,
    });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      reinspectionRequired: false,
      reinspectionDeadline: null,
      replacementBookingRequired: false,
      replacementBookingDeadline: null,
    });
  });

  it('uses a strict future-date rule for FAIL replacement booking', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([failRow({ firstFailDate: '2026-08-15' })])
      .mockResolvedValueOnce([failRow({ firstFailDate: '2026-08-14' })])
      .mockResolvedValueOnce([failRow({ firstFailDate: '2026-08-13' })])
      .mockResolvedValueOnce([
        failRow({ firstFailDate: '2026-08-15', hasScheduledReplacement: true }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ replacementBookingRequired: true });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ replacementBookingRequired: false });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ replacementBookingRequired: false });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ replacementBookingRequired: false });
  });

  it('keeps first-NO_SHOW booking deadlines inclusive and rejects PASS-followed activity', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([noShowRow({ firstNoShowDate: '2026-08-15' })])
      .mockResolvedValueOnce([noShowRow({ firstNoShowDate: '2026-08-14' })])
      .mockResolvedValueOnce([noShowRow({ firstNoShowDate: '2026-08-13' })])
      .mockResolvedValueOnce([
        noShowRow({
          firstNoShowDate: '2026-08-15',
          hasScheduledReplacement: true,
        }),
      ])
      .mockResolvedValueOnce([
        statusRow({
          inspectionId: 'later-inspection',
          inspectionAttemptNumber: 2,
          inspectionResult: InspectionResult.FAIL,
          inspectedAt: new Date(),
          attemptsUsed: 2,
          completedPassCount: 1,
          firstFailDate: '2026-09-13',
        }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ replacementBookingRequired: true });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ replacementBookingRequired: true });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ replacementBookingRequired: false });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ replacementBookingRequired: false });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('maps second-attempt terminal outcomes and rejects a legacy-slot-only state', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        statusRow({
          inspectionId: 'attempt-two-pass',
          inspectionAttemptNumber: 2,
          inspectionResult: InspectionResult.PASS,
          inspectedAt: new Date(),
          attemptsUsed: 2,
          completedPassCount: 1,
        }),
      ])
      .mockResolvedValueOnce([
        statusRow({
          applicationStatus: ApplicationStatus.INSPECTION_FAILED,
          inspectionId: 'attempt-two-fail',
          inspectionAttemptNumber: 2,
          inspectionResult: InspectionResult.FAIL,
          inspectedAt: new Date(),
          attemptsUsed: 2,
        }),
      ])
      .mockResolvedValueOnce([
        statusRow({
          latestAppointmentStatus: null,
          hasLegacyAppointment: true,
        }),
      ]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({ attemptsRemaining: 0, stickerEligible: true });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      attemptsRemaining: 0,
      stickerEligible: false,
      reinspectionRequired: false,
    });
    await expect(
      service.getCitizenApplicationStatus('citizen-id', 'application-id'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('returns completed citizen-owned history with deterministic pagination and no recorder', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string) => {
      statements.push(statement);
      return Promise.resolve([
        {
          applicationId: 'application-id',
          referenceNumber: 'VIR-1',
          attemptNumber: 1,
          result: InspectionResult.FAIL,
          inspectedAt: new Date(),
          failureReason: 'Brake issue',
          stationId: 'station-id',
          stationNameKh: 'Station Kh',
          stationNameEn: 'Station',
          registrationNumber: 'REG-1',
          plateNumber: '2AB-1234',
          plateCategory: 'PROVINCE',
          plateProvince: 'Phnom Penh',
          make: 'Toyota',
          model: 'Prius',
          total: 1,
        },
      ]);
    });
    const service = new InspectionReadsService({ query } as never);

    const result = await service.listCitizenInspectionHistory('citizen-id', {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
    });

    expect(result.data[0]).toMatchObject({
      failureReason: 'Brake issue',
      attemptNumber: 1,
      vehicle: { plateCategory: 'PROVINCE', plateProvince: 'Phnom Penh' },
    });
    expect(result.data[0]).not.toHaveProperty('recordedByUserId');
    expect(statements[0]).toContain('application."citizen_id" = $1');
    expect(statements[0]).toContain('inspection."status" = \'COMPLETED\'');
    expect(statements[0]).toContain('inspection."actual_station_id"');
    expect(statements[0]).toContain('COALESCE(actual_station."id"');
    expect(statements[0]).toContain(
      'ORDER BY inspection."completed_at" DESC, inspection."id" DESC',
    );
  });

  it('filters an owned vehicle before history pagination and preserves reinspection attempts', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string) => {
      statements.push(statement);
      if (statement.includes('FROM "vehicles"')) {
        return Promise.resolve([{ id: 'vehicle-id' }]);
      }
      return Promise.resolve([
        {
          applicationId: 'application-id',
          referenceNumber: 'VIR-1',
          attemptNumber: 1,
          result: InspectionResult.FAIL,
          inspectedAt: new Date('2026-08-01T10:00:00.000Z'),
          failureReason: 'Brake issue',
          stationId: 'station-id',
          stationNameKh: 'Station Kh',
          stationNameEn: 'Station',
          registrationNumber: 'REG-1',
          plateNumber: '2AB-1234',
          make: 'Toyota',
          model: 'Prius',
          total: 2,
        },
        {
          applicationId: 'application-id',
          referenceNumber: 'VIR-1',
          attemptNumber: 2,
          result: InspectionResult.PASS,
          inspectedAt: new Date('2026-08-15T10:00:00.000Z'),
          failureReason: null,
          stationId: 'station-id',
          stationNameKh: 'Station Kh',
          stationNameEn: 'Station',
          registrationNumber: 'REG-1',
          plateNumber: '2AB-1234',
          make: 'Toyota',
          model: 'Prius',
          total: 2,
        },
      ]);
    });
    const service = new InspectionReadsService({ query } as never);

    const result = await service.listCitizenInspectionHistory('citizen-id', {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      vehicleId: 'vehicle-id',
    });

    expect(result.data.map((inspection) => inspection.attemptNumber)).toEqual([
      1, 2,
    ]);
    expect(result.meta).toMatchObject({ total: 2, totalPages: 1 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "vehicles"'),
      ['vehicle-id', 'citizen-id'],
    );
    expect(statements[1]).toContain('application."vehicle_id" = $2');
    expect(statements[1]).toContain('LIMIT $3 OFFSET $4');
  });

  it('rejects a vehicle that is outside the citizen ownership scope', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new InspectionReadsService({ query } as never);

    await expect(
      service.listCitizenInspectionHistory('citizen-id', {
        page: 1,
        limit: 20,
        sortOrder: 'desc',
        vehicleId: 'other-citizen-vehicle-id',
      }),
    ).rejects.toMatchObject({
      code: ApiErrorCode.VEHICLE_NOT_FOUND,
      status: 404,
    });
  });
});

function statusRow(overrides: Record<string, unknown> = {}) {
  return {
    applicationId: 'application-id',
    applicationStatus: ApplicationStatus.APPROVED,
    inspectionId: null,
    inspectionAttemptNumber: null,
    inspectionResult: null,
    inspectedAt: null,
    failureReason: null,
    validUntil: null,
    validityRule: null,
    latestAppointmentStatus: AppointmentStatus.SCHEDULED,
    latestAppointmentDate: '2026-08-14',
    attemptsUsed: 0,
    firstFailDate: null,
    firstNoShowDate: null,
    hasScheduledReplacement: false,
    completedPassCount: 0,
    hasLegacyAppointment: false,
    today: '2026-08-14',
    ...overrides,
  };
}

function failRow(overrides: Record<string, unknown> = {}) {
  return statusRow({
    inspectionId: 'inspection-id',
    inspectionAttemptNumber: 1,
    inspectionResult: InspectionResult.FAIL,
    inspectedAt: new Date(),
    attemptsUsed: 1,
    firstFailDate: '2026-08-15',
    ...overrides,
  });
}

function noShowRow(overrides: Record<string, unknown> = {}) {
  return statusRow({
    latestAppointmentStatus: AppointmentStatus.NO_SHOW,
    firstNoShowDate: '2026-08-15',
    ...overrides,
  });
}
