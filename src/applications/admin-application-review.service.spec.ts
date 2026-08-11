import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { AdminApplicationReviewService } from './admin-application-review.service';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplication } from './entities/renewal-application.entity';

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
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === RenewalApplication
        ? applications
        : entity === ApplicationDocument
          ? documents
          : history,
    ),
  };
  const dataSource = {
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  return {
    service: new AdminApplicationReviewService(
      dataSource as unknown as DataSource,
    ),
    dataSource,
    manager,
    applications,
    documents,
    history,
    application,
    currentDocuments,
  };
}
