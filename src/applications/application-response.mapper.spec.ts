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
});
