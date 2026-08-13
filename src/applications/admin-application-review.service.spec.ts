import 'reflect-metadata';

import { HttpStatus, Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { AuditLog } from '../activity/entities/audit-log.entity';
import { AdminApplicationReviewService } from './admin-application-review.service';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';

describe('AdminApplicationReviewService', () => {
  it('starts review with a lock, clears current reasons, preserves an existing review time, and writes one history row', async () => {
    const existingReviewStartedAt = new Date('2026-08-10T00:00:00.000Z');
    const fixture = createFixture({
      status: ApplicationStatus.SUBMITTED,
      reviewStartedAt: existingReviewStartedAt,
      currentCorrectionReason: 'old correction',
      currentRejectionReason: 'old rejection',
    });

    const result = await fixture.service.startReview(ADMIN_ID, APPLICATION_ID);

    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.applications.findOne).toHaveBeenCalledWith({
      where: { id: APPLICATION_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(result.status).toBe(ApplicationStatus.UNDER_REVIEW);
    expect(fixture.application.reviewStartedAt).toBe(existingReviewStartedAt);
    expect(fixture.application.currentCorrectionReason).toBeNull();
    expect(fixture.application.currentRejectionReason).toBeNull();
    expect(fixture.history.create).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      previousStatus: ApplicationStatus.SUBMITTED,
      newStatus: ApplicationStatus.UNDER_REVIEW,
      changedByUserId: ADMIN_ID,
    });
    expect(fixture.history.save).toHaveBeenCalledTimes(1);
  });

  it('sets reviewStartedAt on the first successful review', async () => {
    const fixture = createFixture({ status: ApplicationStatus.SUBMITTED });

    await fixture.service.startReview(ADMIN_ID, APPLICATION_ID);

    expect(fixture.application.reviewStartedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid or duplicate start-review transitions without another history row', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });

    await expect(
      fixture.service.startReview(ADMIN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it('returns not found for never-submitted applications', async () => {
    const fixture = createFixture({ submittedAt: null });

    await expect(
      fixture.service.startReview(ADMIN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('requests correction by reviewing all current documents and writing one transaction history row', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });

    await fixture.service.requestCorrection(ADMIN_ID, APPLICATION_ID, {
      documentTypes: [DocumentType.CITIZEN_ID_CARD],
      reason: 'Upload a clearer citizen ID.',
    });

    const [registration, certificate, citizenId] = fixture.currentDocuments;
    expect(registration.status).toBe(DocumentStatus.APPROVED);
    expect(registration.rejectionReason).toBeNull();
    expect(certificate.status).toBe(DocumentStatus.APPROVED);
    expect(citizenId.status).toBe(DocumentStatus.REJECTED);
    expect(citizenId.rejectionReason).toBe('Upload a clearer citizen ID.');
    for (const document of fixture.currentDocuments) {
      expect(document.reviewedByUserId).toBe(ADMIN_ID);
      expect(document.reviewedAt).toBeInstanceOf(Date);
    }
    expect(fixture.application.status).toBe(
      ApplicationStatus.CORRECTION_REQUIRED,
    );
    expect(fixture.application.currentCorrectionReason).toBe(
      'Upload a clearer citizen ID.',
    );
    expect(fixture.application.currentRejectionReason).toBeNull();
    expect(fixture.history.create).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      previousStatus: ApplicationStatus.UNDER_REVIEW,
      newStatus: ApplicationStatus.CORRECTION_REQUIRED,
      changedByUserId: ADMIN_ID,
    });
  });

  it('does not partially update when a required current document is missing', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    fixture.documents.find.mockResolvedValue(
      fixture.currentDocuments.slice(0, 2),
    );

    await expect(
      fixture.service.requestCorrection(ADMIN_ID, APPLICATION_ID, {
        documentTypes: [DocumentType.CITIZEN_ID_CARD],
        reason: 'reason',
      }),
    ).rejects.toMatchObject({ code: ApiErrorCode.REQUIRED_DOCUMENTS_MISSING });
    expect(fixture.documents.save).not.toHaveBeenCalled();
    expect(fixture.applications.save).not.toHaveBeenCalled();
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it('rejects an under-review application with history and audit in the same transaction', async () => {
    const reviewStartedAt = new Date('2026-08-10T00:00:00.000Z');
    const fixture = createFixture({
      status: ApplicationStatus.UNDER_REVIEW,
      reviewStartedAt,
      currentCorrectionReason: 'old correction',
    });

    await fixture.service.reject(ADMIN_ID, APPLICATION_ID, {
      reason: 'Rejected after review.',
    });

    expect(fixture.application.status).toBe(ApplicationStatus.REJECTED);
    expect(fixture.application.currentCorrectionReason).toBeNull();
    expect(fixture.application.currentRejectionReason).toBe(
      'Rejected after review.',
    );
    expect(fixture.application.reviewStartedAt).toBe(reviewStartedAt);
    expect(fixture.history.create).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: ApplicationStatus.UNDER_REVIEW,
        newStatus: ApplicationStatus.REJECTED,
        changedByUserId: ADMIN_ID,
      }),
    );
    expect(fixture.audits.create).toHaveBeenCalledWith({
      actorType: 'USER',
      actorUserId: ADMIN_ID,
      applicationId: APPLICATION_ID,
      action: 'APPLICATION_REJECTED',
      entityType: 'RENEWAL_APPLICATION',
      entityId: APPLICATION_ID,
      description: 'Administrator rejected a renewal application.',
      oldValues: {
        status: ApplicationStatus.UNDER_REVIEW,
        currentRejectionReason: null,
      },
      newValues: {
        status: ApplicationStatus.REJECTED,
        currentRejectionReason: 'Rejected after review.',
      },
      ipAddress: null,
      userAgent: null,
    });
    expect(fixture.audits.save).toHaveBeenCalledTimes(1);
  });

  it('reopens a rejected application while preserving submission and review data', async () => {
    const reviewStartedAt = new Date('2026-08-10T00:00:00.000Z');
    const submittedAt = new Date('2026-08-09T00:00:00.000Z');
    const fixture = createFixture({
      status: ApplicationStatus.REJECTED,
      reviewStartedAt,
      submittedAt,
      currentRejectionReason: 'Original rejection reason',
      referenceNumber: 'VIR-20260809-ABCDEF123456',
    });

    await fixture.service.reopen(ADMIN_ID, APPLICATION_ID, {
      reason: 'Reconsidered.',
    });

    expect(fixture.application.status).toBe(ApplicationStatus.UNDER_REVIEW);
    expect(fixture.application.currentRejectionReason).toBeNull();
    expect(fixture.application.reviewStartedAt).toBe(reviewStartedAt);
    expect(fixture.application.submittedAt).toBe(submittedAt);
    expect(fixture.application.referenceNumber).toBe(
      'VIR-20260809-ABCDEF123456',
    );
    expect(fixture.audits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPLICATION_REOPENED',
        oldValues: {
          status: ApplicationStatus.REJECTED,
          currentRejectionReason: 'Original rejection reason',
        },
        newValues: {
          status: ApplicationStatus.UNDER_REVIEW,
          currentRejectionReason: null,
          reopenReason: 'Reconsidered.',
        },
      }),
    );
  });

  it.each([ApplicationStatus.SUBMITTED, ApplicationStatus.REJECTED])(
    'rejects invalid reject transition from %s without history or audit',
    async (status) => {
      const fixture = createFixture({ status });
      await expect(
        fixture.service.reject(ADMIN_ID, APPLICATION_ID, { reason: 'reason' }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      });
      expect(fixture.history.save).not.toHaveBeenCalled();
      expect(fixture.audits.save).not.toHaveBeenCalled();
    },
  );

  it('passes review only by reserving daily capacity, creating a daily appointment, and approving in one transaction', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });

    await expect(
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({ status: ApplicationStatus.APPROVED });
    expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.applications.findOne).toHaveBeenCalledWith({
      where: { id: APPLICATION_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(
      fixture.dailyCapacities.reserveDailyCapacityWithManager,
    ).toHaveBeenCalledWith(fixture.manager, 'station-id', '2026-08-12');
    expect(fixture.appointments.create).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      slotId: null,
      dailyCapacity: fixture.reservedDailyCapacity,
      status: AppointmentStatus.SCHEDULED,
      completedAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      noShowMarkedAt: null,
      noShowMarkedByUserId: null,
    });
    expect(fixture.appointments.save).toHaveBeenCalledTimes(1);
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
    expect(fixture.payments.initializePayment).toHaveBeenCalledWith(
      APPLICATION_ID,
    );
    expect(fixture.application.preferredInspectionStationId).toBe('station-id');
    expect(fixture.application.preferredInspectionDate).toBe('2026-08-12');
    expect(fixture.history.create).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      previousStatus: ApplicationStatus.UNDER_REVIEW,
      newStatus: ApplicationStatus.APPROVED,
      changedByUserId: ADMIN_ID,
    });
  });

  it.each([
    'full capacity',
    'closed date',
    'inactive station',
    'missing capacity row',
    'today',
    'past date',
  ])(
    'uses appointment selection fallback when reservation finds %s',
    async () => {
      const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
      fixture.dailyCapacities.reserveDailyCapacityWithManager.mockResolvedValue(
        null,
      );

      await expect(
        fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
      ).resolves.toMatchObject({
        status: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
      });
      expect(fixture.appointments.save).not.toHaveBeenCalled();
      expect(fixture.payments.initializePayment).not.toHaveBeenCalled();
      expect(fixture.application.preferredInspectionStationId).toBe(
        'station-id',
      );
      expect(fixture.application.preferredInspectionDate).toBe('2026-08-12');
      expect(fixture.history.create).toHaveBeenCalledWith({
        applicationId: APPLICATION_ID,
        previousStatus: ApplicationStatus.UNDER_REVIEW,
        newStatus: ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
        changedByUserId: ADMIN_ID,
      });
    },
  );

  it.each([
    ApplicationStatus.DRAFT,
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
    ApplicationStatus.REJECTED,
  ])('does not reserve twice or pass review from %s', async (status) => {
    const fixture = createFixture({ status });

    await expect(
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(
      fixture.dailyCapacities.reserveDailyCapacityWithManager,
    ).not.toHaveBeenCalled();
    expect(fixture.appointments.save).not.toHaveBeenCalled();
    expect(fixture.history.save).not.toHaveBeenCalled();
    expect(fixture.payments.initializePayment).not.toHaveBeenCalled();
  });

  it('keeps the committed review-pass response when payment initialization fails', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    fixture.payments.initializePayment.mockRejectedValue(
      new Error('invoice generation failed'),
    );

    await expect(
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({ status: ApplicationStatus.APPROVED });
    expect(fixture.payments.initializePayment).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining(APPLICATION_ID),
      expect.any(String),
    );
    loggerError.mockRestore();
  });

  it('fails safely for a corrupted UNDER_REVIEW application without a complete preference pair', async () => {
    const fixture = createFixture({
      status: ApplicationStatus.UNDER_REVIEW,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
    });

    await expect(
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(
      fixture.dailyCapacities.reserveDailyCapacityWithManager,
    ).not.toHaveBeenCalled();
    expect(fixture.appointments.save).not.toHaveBeenCalled();
    expect(fixture.applications.save).not.toHaveBeenCalled();
  });

  it('does not proceed to an application status change when appointment creation fails', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    const failure = new Error('appointment insert failed');
    fixture.appointments.save.mockRejectedValue(failure);

    await expect(
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).rejects.toBe(failure);
    expect(fixture.application.status).toBe(ApplicationStatus.UNDER_REVIEW);
    expect(fixture.applications.save).not.toHaveBeenCalled();
    expect(fixture.history.save).not.toHaveBeenCalled();
  });
});

function createFixture(overrides: Record<string, unknown> = {}) {
  const application = {
    id: APPLICATION_ID,
    citizenId: 'citizen-id',
    vehicleId: 'vehicle-id',
    referenceNumber: 'VIR-20260810-ABCDEF123456',
    status: ApplicationStatus.SUBMITTED,
    submittedAt: new Date(),
    reviewStartedAt: null,
    currentCorrectionReason: null,
    currentRejectionReason: null,
    preferredInspectionStationId: 'station-id',
    preferredInspectionDate: '2026-08-12',
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    applicantSnapshot: {},
    vehicleSnapshot: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  const currentDocuments = Object.values(DocumentType).map((documentType) => ({
    id: documentType,
    applicationId: APPLICATION_ID,
    documentType,
    isCurrent: true,
    status: DocumentStatus.PENDING,
    rejectionReason: 'old',
    reviewedByUserId: null,
    reviewedAt: null,
  }));
  const applications = {
    findOne: jest.fn().mockResolvedValue(application),
    save: jest.fn().mockResolvedValue(application),
  };
  const documents = {
    find: jest.fn().mockResolvedValue(currentDocuments),
    save: jest.fn().mockResolvedValue(currentDocuments),
  };
  const history = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const audits = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const appointments = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const dailyCapacities = {
    reserveDailyCapacityWithManager: jest.fn().mockResolvedValue({
      id: 'daily-capacity-id',
      stationId: 'station-id',
      capacityDate: '2026-08-12',
    }),
  };
  const reservedDailyCapacity = {
    id: 'daily-capacity-id',
    stationId: 'station-id',
    capacityDate: '2026-08-12',
  };
  const dailyCapacityRecords = {
    findOneByOrFail: jest.fn().mockResolvedValue(reservedDailyCapacity),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === RenewalApplication
        ? applications
        : entity === ApplicationDocument
          ? documents
          : entity === AuditLog
            ? audits
            : entity === Appointment
              ? appointments
              : entity === InspectionStationDailyCapacity
                ? dailyCapacityRecords
                : history,
    ),
  };
  const dataSource = {
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const payments = { initializePayment: jest.fn().mockResolvedValue({}) };
  return {
    service: new AdminApplicationReviewService(
      dataSource as unknown as DataSource,
      dailyCapacities as never,
      payments as never,
    ),
    dataSource,
    manager,
    applications,
    documents,
    history,
    audits,
    appointments,
    dailyCapacities,
    payments,
    reservedDailyCapacity,
    application,
    currentDocuments,
  };
}
