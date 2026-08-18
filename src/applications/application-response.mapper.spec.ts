import { ApplicationStatus } from './enums/application-status.enum';
import { mapRenewalApplication } from './application-response.mapper';
import { mapRenewalApplicationStatusHistory } from './application-status-history-response.mapper';

describe('application response mappers', () => {
  it('maps a draft without a reference number or submission timestamp', () => {
    const application = {
      id: 'application-id',
      referenceNumber: null,
      citizenId: 'citizen-id',
      vehicleId: 'vehicle-id',
      status: ApplicationStatus.DRAFT,
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      submittedAt: null,
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
      applicantSnapshot: null,
      vehicleSnapshot: null,
    };

    const mapped = mapRenewalApplication(application as never);

    expect(mapped).toEqual(
      expect.objectContaining({
        referenceNumber: null,
        currentRejectionReason: null,
        preferredInspectionStationId: null,
        preferredInspectionDate: null,
        submittedAt: null,
        status: ApplicationStatus.DRAFT,
      }),
    );
    expect(mapped).not.toHaveProperty('applicantSnapshot');
    expect(mapped).not.toHaveProperty('vehicleSnapshot');
  });

  it('maps an initial history record with a null previous status', () => {
    expect(
      mapRenewalApplicationStatusHistory({
        id: 'history-id',
        applicationId: 'application-id',
        previousStatus: null,
        newStatus: ApplicationStatus.DRAFT,
        changedByUserId: 'citizen-id',
        createdAt: new Date('2026-08-07T00:00:00.000Z'),
      } as never),
    ).toEqual({
      id: 'history-id',
      applicationId: 'application-id',
      previousStatus: null,
      newStatus: ApplicationStatus.DRAFT,
      changedByUserId: 'citizen-id',
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
    });
  });

  it('exposes submitted reference fields but excludes persistence snapshots', () => {
    const mapped = mapRenewalApplication({
      id: 'id',
      referenceNumber: 'VIR-20260810-A3F7C92D18BE',
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      applicantSnapshot: { secret: true },
      vehicleSnapshot: { secret: true },
      cancelledByUserId: 'c',
      currentCorrectionReason: null,
      currentRejectionReason: 'The inspection result was rejected.',
      preferredInspectionStationId: 'station-id',
      preferredInspectionDate: '2026-08-12',
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    expect(mapped.referenceNumber).toMatch(/^VIR-/);
    expect(mapped.submittedAt).toBeInstanceOf(Date);
    expect(mapped.currentRejectionReason).toBe(
      'The inspection result was rejected.',
    );
    expect(mapped.preferredInspectionStationId).toBe('station-id');
    expect(mapped.preferredInspectionDate).toBe('2026-08-12');
    expect(mapped).not.toHaveProperty('applicantSnapshot');
    expect(mapped).not.toHaveProperty('vehicleSnapshot');
    expect(mapped).not.toHaveProperty('cancelledByUserId');
  });

  it('exposes submitted fields but not persistence-only fields for a cancelled application', () => {
    const submittedAt = new Date('2026-08-10T00:00:00.000Z');
    const mapped = mapRenewalApplication({
      id: 'id',
      referenceNumber: 'VIR-20260810-A3F7C92D18BE',
      citizenId: 'c',
      vehicleId: 'v',
      status: ApplicationStatus.CANCELLED,
      submittedAt,
      applicantSnapshot: { secret: true },
      vehicleSnapshot: { secret: true },
      cancelledByUserId: 'c',
      currentCorrectionReason: null,
      currentRejectionReason: null,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
      reviewStartedAt: null,
      readyForInspectionAt: null,
      completedAt: null,
      cancelledAt: new Date('2026-08-10T01:00:00.000Z'),
      cancellationReason: 'No longer required',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(mapped.referenceNumber).toBe('VIR-20260810-A3F7C92D18BE');
    expect(mapped.submittedAt).toBe(submittedAt);
    expect(mapped.currentRejectionReason).toBeNull();
    expect(mapped).not.toHaveProperty('applicantSnapshot');
    expect(mapped).not.toHaveProperty('vehicleSnapshot');
    expect(mapped).not.toHaveProperty('cancelledByUserId');
  });
});
