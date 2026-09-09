import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { AuditLog } from '../activity/entities/audit-log.entity';
import { ApplicationTimelineEvent } from '../activity/entities/application-timeline-event.entity';
import { TimelineEventType } from '../activity/enums/timeline-event-type.enum';
import { AdminApplicationReviewService } from './admin-application-review.service';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Sticker } from '../stickers/entities/sticker.entity';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';

describe('AdminApplicationReviewService', () => {
  it('canonically expires a post-sticker application instead of starting review on Day 31', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-06T17:00:00.000Z'));
    try {
      const fixture = createFixture({
        status: ApplicationStatus.APPROVED,
        submittedAt: new Date('2026-09-07T08:30:00.000Z'),
      });

      await expect(
        fixture.service.startReview(ADMIN_ID, APPLICATION_ID),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        status: 409,
      });

      expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
      expect(fixture.history.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousStatus: ApplicationStatus.APPROVED,
          newStatus: ApplicationStatus.EXPIRED,
          changedByUserId: null,
          reason: 'INITIAL_INSPECTION_PERIOD_EXPIRED',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts review with a lock, clears current reasons, preserves an existing review time, and writes one history row', async () => {
    const existingReviewStartedAt = new Date('2026-08-10T00:00:00.000Z');
    const fixture = createFixture({
      status: ApplicationStatus.APPROVED,
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
      previousStatus: ApplicationStatus.APPROVED,
      newStatus: ApplicationStatus.UNDER_REVIEW,
      changedByUserId: ADMIN_ID,
    });
    expect(fixture.history.save).toHaveBeenCalledTimes(1);
  });

  it('sets reviewStartedAt on the first successful review', async () => {
    const fixture = createFixture({ status: ApplicationStatus.APPROVED });

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

  it.each([
    ['pre-payment SUBMITTED', { status: ApplicationStatus.SUBMITTED }],
    ['missing readiness', { readyForInspectionAt: null }],
    ['unconfirmed payment', { paymentStatus: PaymentStatus.PENDING }],
    ['missing primary PASS', { inspection: null }],
    ['incomplete primary PASS', { inspectionCompletedAt: null }],
    ['missing issued sticker', { sticker: null }],
    ['sticker without issuedAt', { stickerIssuedAt: null }],
  ])(
    'rejects start-review before post-sticker readiness: %s',
    async (_name, overrides) => {
      const fixture = createFixture(overrides);

      await expect(
        fixture.service.startReview(ADMIN_ID, APPLICATION_ID),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        status: HttpStatus.CONFLICT,
      });

      expect(fixture.application.status).not.toBe(
        ApplicationStatus.UNDER_REVIEW,
      );
      expect(fixture.history.save).not.toHaveBeenCalled();
    },
  );

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
    const submittedAt = new Date();
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

  it('passes review without reserving capacity or creating an appointment', async () => {
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
    ).not.toHaveBeenCalled();
    expect(fixture.appointments.save).not.toHaveBeenCalled();
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
    expect(fixture.application.completedAt).toBeNull();
    for (const document of fixture.currentDocuments) {
      expect(document).toMatchObject({
        status: DocumentStatus.APPROVED,
        rejectionReason: null,
        reviewedByUserId: ADMIN_ID,
        reviewedAt: fixture.approvalTimestamp,
      });
    }
    expect(fixture.events.create).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      eventType: TimelineEventType.DOCUMENTS_APPROVED,
      title: 'Documents approved',
      message: null,
      actorUserId: ADMIN_ID,
      visibleToCitizen: true,
      metadata: null,
      occurredAt: fixture.approvalTimestamp,
    });
    expect(fixture.events.save).toHaveBeenCalledTimes(1);
    expect(fixture.payments.initializePayment).not.toHaveBeenCalled();
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
    'does not use an appointment-selection fallback when legacy capacity is %s',
    async () => {
      const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
      await expect(
        fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
      ).resolves.toMatchObject({
        status: ApplicationStatus.APPROVED,
      });
      expect(fixture.appointments.save).not.toHaveBeenCalled();
      expect(
        fixture.dailyCapacities.reserveDailyCapacityWithManager,
      ).not.toHaveBeenCalled();
      expect(fixture.application.preferredInspectionStationId).toBe(
        'station-id',
      );
      expect(fixture.application.preferredInspectionDate).toBe('2026-08-12');
      expect(fixture.history.create).toHaveBeenCalledWith({
        applicationId: APPLICATION_ID,
        previousStatus: ApplicationStatus.UNDER_REVIEW,
        newStatus: ApplicationStatus.APPROVED,
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

  it('does not initialize another payment on review pass', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    await expect(
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({ status: ApplicationStatus.APPROVED });
    expect(fixture.payments.initializePayment).not.toHaveBeenCalled();
  });

  it('does not depend on the legacy appointment preference pair during post-sticker document approval', async () => {
    const fixture = createFixture({
      status: ApplicationStatus.UNDER_REVIEW,
      preferredInspectionStationId: null,
      preferredInspectionDate: null,
    });

    await expect(
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({ status: ApplicationStatus.APPROVED });
    expect(
      fixture.dailyCapacities.reserveDailyCapacityWithManager,
    ).not.toHaveBeenCalled();
    expect(fixture.appointments.save).not.toHaveBeenCalled();
    expect(fixture.events.save).toHaveBeenCalledTimes(1);
  });

  it('rejects review approval when any current required document is missing or rejected', async () => {
    const missing = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    missing.documents.find.mockResolvedValue(
      missing.currentDocuments.slice(0, 2),
    );
    await expect(
      missing.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
    });

    const rejected = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    rejected.currentDocuments[0].status = DocumentStatus.REJECTED;
    await expect(
      rejected.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
    });
    expect(missing.events.save).not.toHaveBeenCalled();
    expect(rejected.events.save).not.toHaveBeenCalled();
  });

  it('prevents review restart after the authoritative DOCUMENTS_APPROVED event', async () => {
    const fixture = createFixture({
      status: ApplicationStatus.APPROVED,
      documentsApprovedEvent: { id: 'documents-approved-event-id' },
    });

    await expect(
      fixture.service.startReview(ADMIN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it('serializes concurrent review approvals to one transition and one event', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    serializeReviewTransactions(fixture);

    const results = await Promise.allSettled([
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(fixture.history.save).toHaveBeenCalledTimes(1);
    expect(fixture.events.save).toHaveBeenCalledTimes(1);
  });

  it('serializes correction-request versus review-pass so only one Step-05 outcome wins', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    serializeReviewTransactions(fixture);

    const results = await Promise.allSettled([
      fixture.service.requestCorrection(ADMIN_ID, APPLICATION_ID, {
        documentTypes: [DocumentType.CITIZEN_ID_CARD],
        reason: 'Replace this document.',
      }),
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(fixture.history.save).toHaveBeenCalledTimes(1);
    expect([
      ApplicationStatus.CORRECTION_REQUIRED,
      ApplicationStatus.APPROVED,
    ]).toContain(fixture.application.status);
  });

  it('does not create an appointment while passing review', async () => {
    const fixture = createFixture({ status: ApplicationStatus.UNDER_REVIEW });
    await expect(
      fixture.service.passReview(ADMIN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({ status: ApplicationStatus.APPROVED });
    expect(fixture.appointments.save).not.toHaveBeenCalled();
  });
});

function createFixture(overrides: Record<string, unknown> = {}) {
  const approvalTimestamp = new Date('2026-08-14T03:00:00.000Z');
  const application = {
    id: APPLICATION_ID,
    citizenId: 'citizen-id',
    vehicleId: 'vehicle-id',
    referenceNumber: 'VIR-20260810-ABCDEF123456',
    status: ApplicationStatus.APPROVED,
    submittedAt: new Date(),
    reviewStartedAt: null,
    currentCorrectionReason: null,
    currentRejectionReason: null,
    preferredInspectionStationId: 'station-id',
    preferredInspectionDate: '2026-08-12',
    readyForInspectionAt: new Date('2026-08-11T00:00:00.000Z'),
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
  const payment = {
    applicationId: APPLICATION_ID,
    status:
      (overrides.paymentStatus as PaymentStatus | undefined) ??
      PaymentStatus.CONFIRMED,
  };
  const inspection = Object.prototype.hasOwnProperty.call(
    overrides,
    'inspection',
  )
    ? overrides.inspection
    : {
        id: 'inspection-id',
        applicationId: APPLICATION_ID,
        attemptNumber: 1,
        status: InspectionStatus.COMPLETED,
        result: InspectionResult.PASS,
        completedAt: Object.prototype.hasOwnProperty.call(
          overrides,
          'inspectionCompletedAt',
        )
          ? overrides.inspectionCompletedAt
          : new Date('2026-08-12T00:00:00.000Z'),
      };
  const sticker = Object.prototype.hasOwnProperty.call(overrides, 'sticker')
    ? overrides.sticker
    : {
        id: 'sticker-id',
        applicationId: APPLICATION_ID,
        inspectionId: 'inspection-id',
        issuedAt: Object.prototype.hasOwnProperty.call(
          overrides,
          'stickerIssuedAt',
        )
          ? overrides.stickerIssuedAt
          : new Date('2026-08-13T00:00:00.000Z'),
      };
  const paymentRepository = {
    findOne: jest.fn().mockResolvedValue(payment),
  };
  const inspectionRepository = {
    findOne: jest.fn().mockResolvedValue(inspection),
  };
  const stickerRepository = {
    findOne: jest.fn().mockResolvedValue(sticker),
  };
  const documentsApprovedEvent =
    (overrides.documentsApprovedEvent as object | null | undefined) ?? null;
  const events = {
    findOne: jest.fn().mockResolvedValue(documentsApprovedEvent),
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn().mockResolvedValue(undefined),
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
        : entity === Payment
          ? paymentRepository
          : entity === Inspection
            ? inspectionRepository
            : entity === Sticker
              ? stickerRepository
              : entity === ApplicationTimelineEvent
                ? events
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
    query: jest.fn().mockResolvedValue([{ now: approvalTimestamp }]),
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
    ),
    dataSource,
    manager,
    applications,
    documents,
    history,
    events,
    approvalTimestamp,
    audits,
    appointments,
    dailyCapacities,
    payments,
    reservedDailyCapacity,
    application,
    currentDocuments,
  };
}

function serializeReviewTransactions(
  fixture: ReturnType<typeof createFixture>,
) {
  let previous = Promise.resolve();
  fixture.dataSource.transaction.mockImplementation(
    (
      callback: (
        transactionManager: typeof fixture.manager,
      ) => Promise<unknown>,
    ) => {
      const current = previous.then(() => callback(fixture.manager));
      previous = current.then(
        () => undefined,
        () => undefined,
      );
      return current;
    },
  );
}
