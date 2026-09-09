import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { AuditLog } from '../activity/entities/audit-log.entity';
import { ApplicationTimelineEvent } from '../activity/entities/application-timeline-event.entity';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { FilesService } from '../files/files.service';
import { CitizenProfile } from '../users/entities/citizen-profile.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';
import { AdminApplicationReviewService } from './admin-application-review.service';
import { ApplicationDocumentsService } from './application-documents.service';
import { ApplicationWorkflowService } from './application-workflow.service';
import { RenewAgainService } from './renew-again.service';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { Sticker } from '../stickers/entities/sticker.entity';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const UPLOADER_ADMIN_ID = '44444444-4444-4444-8444-444444444444';
const RESUBMITTER_ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';

describe('application workflow integration', () => {
  it('submits repeated Apply Again drafts through the normal payment and snapshot flow', async () => {
    const fixture = createFixture();
    const workflow = new ApplicationWorkflowService(
      fixture.dataSource as unknown as DataSource,
      {
        validatePreferredDateForSubmission: jest.fn(),
        validateOptionalStationWithManager: jest.fn().mockResolvedValue(),
      } as never,
    );
    const renewAgain = new RenewAgainService(
      fixture.dataSource as unknown as DataSource,
      fixture.filesService as FilesService,
      workflow,
    );
    const source = expiredApplication();
    source.status = ApplicationStatus.INSPECTION_FAILED;
    const sourceBefore = structuredClone(source);
    fixture.applications.push(source);
    fixture.documents.push(
      ...Object.values(DocumentType).map((documentType) =>
        expiredSourceDocument(documentType),
      ),
    );
    fixture.payments.push({
      id: 'source-payment-id',
      applicationId: source.id,
      invoiceNumber: 'INV-20260701-000001',
      method: PaymentMethod.PAY_AT_STATION,
      status: PaymentStatus.CONFIRMED,
    } as Payment);
    Object.assign(source, {
      inspections: [
        {
          attemptNumber: 1,
          result: 'FAIL',
          failureReason: 'Brake issue',
        },
      ],
      payment: fixture.payments[0],
      statusHistory: [
        {
          previousStatus: ApplicationStatus.APPROVED,
          newStatus: ApplicationStatus.INSPECTION_FAILED,
          reason: 'INITIAL_INSPECTION_FAILED',
        },
      ],
    });
    const sourceEvidenceBefore = structuredClone(source);
    const sourceDocumentsBefore = structuredClone(fixture.documents);
    const sourcePaymentsBefore = structuredClone(fixture.payments);

    const renewed = await renewAgain.createReplacementDraft(
      CITIZEN_ID,
      source.id,
      {
        status: ApplicationStatus.INSPECTION_FAILED,
        invalidSourceMessage:
          'Only an inspection-failed application can be applied for again',
      },
    );
    const draft = fixture.applications.find(
      (application) => application.id === renewed.id,
    );
    if (draft === undefined) throw new Error('Expected renewed draft');

    expect(draft).toMatchObject({
      status: ApplicationStatus.DRAFT,
      vehicleId: VEHICLE_ID,
      referenceNumber: null,
      applicantSnapshot: null,
      vehicleSnapshot: null,
      preferredInspectionDate: null,
      preferredInspectionStationId: null,
      submittedAt: null,
    });
    expect(
      fixture.documents
        .filter((document) => document.applicationId === draft.id)
        .map((document) => document.storageKey),
    ).not.toEqual(
      fixture.documents
        .filter((document) => document.applicationId === source.id)
        .map((document) => document.storageKey),
    );
    expect(source).toEqual({ ...sourceBefore, ...sourceEvidenceBefore });
    expect(
      fixture.documents.filter(
        (document) => document.applicationId === source.id,
      ),
    ).toEqual(sourceDocumentsBefore);
    expect(fixture.payments).toHaveLength(1);
    expect(fixture.payments).toEqual(sourcePaymentsBefore);

    draft.preferredInspectionDate = '2026-08-12';
    draft.preferredInspectionStationId = 'station-id';
    fixture.payments.push({
      id: 'new-payment-id',
      applicationId: draft.id,
      method: PaymentMethod.PAY_AT_STATION,
      status: PaymentStatus.PENDING,
    } as Payment);

    await workflow.submit(CITIZEN_ID, draft.id);

    expect(draft.status).toBe(ApplicationStatus.SUBMITTED);
    expect(draft.referenceNumber).toMatch(/^VIR-\d{8}-[A-F0-9]{12}$/);
    expect(draft.applicantSnapshot).toMatchObject({
      nameKh: 'Citizen Khmer',
      nameEn: 'Citizen English',
    });
    expect(draft.vehicleSnapshot).toMatchObject({
      vehicleId: VEHICLE_ID,
      plateNumber: '2A-3146',
    });
    expect(draft.submittedAt).toBeInstanceOf(Date);
    expect(draft.referenceNumber).not.toBe(source.referenceNumber);
    expect(draft.applicantSnapshot).not.toEqual(source.applicantSnapshot);
    expect(draft.vehicleSnapshot).not.toEqual(source.vehicleSnapshot);
    expect(fixture.payments).toHaveLength(2);
    expect(fixture.payments[0]?.applicationId).toBe(source.id);
    expect(fixture.payments[1]?.applicationId).toBe(draft.id);

    draft.status = ApplicationStatus.INSPECTION_FAILED;
    const failedDraftBefore = structuredClone(draft);
    const appliedAgain = await renewAgain.createReplacementDraft(
      CITIZEN_ID,
      draft.id,
      {
        status: ApplicationStatus.INSPECTION_FAILED,
        invalidSourceMessage:
          'Only an inspection-failed application can be applied for again',
      },
    );
    const secondDraft = fixture.applications.find(
      (application) => application.id === appliedAgain.id,
    );
    expect(secondDraft).toMatchObject({
      status: ApplicationStatus.DRAFT,
      vehicleId: VEHICLE_ID,
      referenceNumber: null,
      submittedAt: null,
    });
    expect(draft).toEqual(failedDraftBefore);
    expect(
      fixture.documents
        .filter((document) => document.applicationId === secondDraft?.id)
        .map((document) => document.storageKey),
    ).not.toEqual(
      fixture.documents
        .filter((document) => document.applicationId === draft.id)
        .map((document) => document.storageKey),
    );
  });

  it('runs mixed citizen/admin correction and admin resubmit through real services', async () => {
    const fixture = createFixture();
    const workflow = new ApplicationWorkflowService(
      fixture.dataSource as unknown as DataSource,
      {
        validatePreferredDateForSubmission: jest.fn(),
        validateOptionalStationWithManager: jest.fn().mockResolvedValue(),
      } as never,
    );
    const documents = new ApplicationDocumentsService(
      fixture.dataSource as unknown as DataSource,
      fixture.filesService as FilesService,
    );
    const review = new AdminApplicationReviewService(
      fixture.dataSource as unknown as DataSource,
    );

    const draft = await workflow.createDraft(CITIZEN_ID, VEHICLE_ID);
    const application = fixture.applications[0];
    expect(draft.status).toBe(ApplicationStatus.DRAFT);
    expect(application.referenceNumber).toBeNull();
    expect(fixture.history).toHaveLength(1);
    application.preferredInspectionStationId = 'station-id';
    application.preferredInspectionDate = '2026-08-12';

    for (const documentType of Object.values(DocumentType)) {
      await documents.upload(
        CITIZEN_ID,
        application.id,
        documentType,
        pdfFile(documentType),
      );
    }

    fixture.payments.push({
      id: 'payment-id',
      applicationId: application.id,
      invoiceNumber: 'INV-20260808-000001',
      method: PaymentMethod.PAY_AT_STATION,
      status: PaymentStatus.PENDING,
    } as Payment);

    await workflow.submit(CITIZEN_ID, application.id);
    const referenceNumber = application.referenceNumber;
    const submittedAt = application.submittedAt;
    const applicantSnapshot = application.applicantSnapshot;
    const vehicleSnapshot = application.vehicleSnapshot;
    expect(application.status).toBe(ApplicationStatus.SUBMITTED);
    expect(referenceNumber).toMatch(/^VIR-\d{8}-[A-F0-9]{12}$/);
    expect(applicantSnapshot).toEqual({
      userId: CITIZEN_ID,
      nameKh: 'Citizen Khmer',
      nameEn: 'Citizen English',
      nationalIdNumber: 'NID-123',
      phone: '010000000',
      email: 'citizen@example.test',
      address: 'Phnom Penh',
    });
    expect(vehicleSnapshot).toMatchObject({
      vehicleId: VEHICLE_ID,
      plateNumber: '2A-3146',
      vehicleClass: VehicleClass.LIGHT,
      inspectionCategoryId: 'category-id',
    });

    fixture.payments[0].status = PaymentStatus.CONFIRMED;
    application.status = ApplicationStatus.APPROVED;
    application.readyForInspectionAt = new Date();
    fixture.inspections.push({
      id: 'inspection-id',
      applicationId: application.id,
      attemptNumber: 1,
      status: InspectionStatus.COMPLETED,
      result: InspectionResult.PASS,
      completedAt: new Date(),
    } as Inspection);
    fixture.stickers.push({
      id: 'sticker-id',
      applicationId: application.id,
      inspectionId: 'inspection-id',
      issuedAt: new Date(),
    } as Sticker);
    const paymentBeforeCorrection = structuredClone(fixture.payments[0]);
    const inspectionsBeforeCorrection = structuredClone(fixture.inspections);
    const stickersBeforeCorrection = structuredClone(fixture.stickers);

    await review.startReview(ADMIN_ID, application.id);
    const originalReviewStartedAt = application.reviewStartedAt;
    expect(application.status).toBe(ApplicationStatus.UNDER_REVIEW);
    expect(originalReviewStartedAt).toBeInstanceOf(Date);

    const correctionReason = 'Replace the registration card';
    await review.requestCorrection(ADMIN_ID, application.id, {
      documentTypes: [
        DocumentType.VEHICLE_REGISTRATION_CARD,
        DocumentType.CITIZEN_ID_CARD,
      ],
      reason: correctionReason,
    });
    const currentVrc = currentDocument(
      fixture.documents,
      DocumentType.VEHICLE_REGISTRATION_CARD,
    );
    expect(application.status).toBe(ApplicationStatus.CORRECTION_REQUIRED);
    expect(application.currentCorrectionReason).toBe(correctionReason);
    expect(currentVrc).toMatchObject({
      status: DocumentStatus.REJECTED,
      rejectionReason: correctionReason,
      reviewedByUserId: ADMIN_ID,
    });
    expect(currentVrc.reviewedAt).toBeInstanceOf(Date);
    expect(
      currentDocument(
        fixture.documents,
        DocumentType.PREVIOUS_INSPECTION_CERTIFICATE,
      ),
    ).toMatchObject({
      status: DocumentStatus.APPROVED,
      rejectionReason: null,
      reviewedByUserId: ADMIN_ID,
    });
    expect(
      currentDocument(fixture.documents, DocumentType.CITIZEN_ID_CARD),
    ).toMatchObject({
      status: DocumentStatus.REJECTED,
      rejectionReason: correctionReason,
      reviewedByUserId: ADMIN_ID,
    });

    const documentCountBeforeInvalidReplacement = fixture.documents.length;
    await expect(
      documents.upload(
        CITIZEN_ID,
        application.id,
        DocumentType.PREVIOUS_INSPECTION_CERTIFICATE,
        pdfFile(DocumentType.PREVIOUS_INSPECTION_CERTIFICATE),
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.documents).toHaveLength(
      documentCountBeforeInvalidReplacement,
    );

    await documents.uploadAsAdmin(
      UPLOADER_ADMIN_ID,
      application.id,
      DocumentType.VEHICLE_REGISTRATION_CARD,
      pdfFile(DocumentType.VEHICLE_REGISTRATION_CARD),
    );
    const currentCitizenId = currentDocument(
      fixture.documents,
      DocumentType.CITIZEN_ID_CARD,
    );
    await documents.upload(
      CITIZEN_ID,
      application.id,
      DocumentType.CITIZEN_ID_CARD,
      pdfFile(DocumentType.CITIZEN_ID_CARD),
    );
    const replacementVrc = currentDocument(
      fixture.documents,
      DocumentType.VEHICLE_REGISTRATION_CARD,
    );
    expect(currentVrc).toMatchObject({
      isCurrent: false,
      status: DocumentStatus.REJECTED,
    });
    expect(replacementVrc).toMatchObject({
      versionNumber: 2,
      isCurrent: true,
      replacesDocumentId: currentVrc.id,
      uploadedByUserId: UPLOADER_ADMIN_ID,
      status: DocumentStatus.PENDING,
      rejectionReason: null,
    });
    expect(
      currentDocument(fixture.documents, DocumentType.CITIZEN_ID_CARD),
    ).toMatchObject({
      versionNumber: 2,
      replacesDocumentId: currentCitizenId.id,
      uploadedByUserId: CITIZEN_ID,
      status: DocumentStatus.PENDING,
    });
    expect(
      currentDocument(
        fixture.documents,
        DocumentType.PREVIOUS_INSPECTION_CERTIFICATE,
      ),
    ).toMatchObject({ status: DocumentStatus.APPROVED, versionNumber: 1 });

    await workflow.resubmitAsAdmin(RESUBMITTER_ADMIN_ID, application.id);
    expect(application).toMatchObject({
      status: ApplicationStatus.UNDER_REVIEW,
      referenceNumber,
      applicantSnapshot,
      vehicleSnapshot,
      submittedAt,
      reviewStartedAt: originalReviewStartedAt,
      currentCorrectionReason: correctionReason,
    });
    expect(fixture.applications).toHaveLength(1);
    expect(fixture.payments).toEqual([paymentBeforeCorrection]);
    expect(fixture.inspections).toEqual(inspectionsBeforeCorrection);
    expect(fixture.stickers).toEqual(stickersBeforeCorrection);

    expect(application).toMatchObject({
      status: ApplicationStatus.UNDER_REVIEW,
      reviewStartedAt: originalReviewStartedAt,
      currentCorrectionReason: correctionReason,
    });

    const documentsBeforeRejection = documentSnapshot(fixture.documents);
    const rejectionReason = 'Application information cannot be verified';
    await review.reject(ADMIN_ID, application.id, { reason: rejectionReason });
    expect(application).toMatchObject({
      status: ApplicationStatus.REJECTED,
      currentCorrectionReason: null,
      currentRejectionReason: rejectionReason,
      referenceNumber,
      applicantSnapshot,
      vehicleSnapshot,
      submittedAt,
      reviewStartedAt: originalReviewStartedAt,
    });
    expect(documentSnapshot(fixture.documents)).toEqual(
      documentsBeforeRejection,
    );
    expect(fixture.auditLogs).toContainEqual(
      expect.objectContaining({
        action: 'APPLICATION_REJECTED',
        oldValues: {
          status: ApplicationStatus.UNDER_REVIEW,
          currentRejectionReason: null,
        },
        newValues: {
          status: ApplicationStatus.REJECTED,
          currentRejectionReason: rejectionReason,
        },
      }),
    );

    const reopenReason = 'Evidence was received';
    await review.reopen(ADMIN_ID, application.id, { reason: reopenReason });
    expect(application).toMatchObject({
      status: ApplicationStatus.UNDER_REVIEW,
      currentRejectionReason: null,
      referenceNumber,
      applicantSnapshot,
      vehicleSnapshot,
      submittedAt,
      reviewStartedAt: originalReviewStartedAt,
    });
    expect(documentSnapshot(fixture.documents)).toEqual(
      documentsBeforeRejection,
    );
    expect(fixture.auditLogs).toContainEqual(
      expect.objectContaining({
        action: 'APPLICATION_REOPENED',
        oldValues: {
          status: ApplicationStatus.REJECTED,
          currentRejectionReason: rejectionReason,
        },
        newValues: {
          status: ApplicationStatus.UNDER_REVIEW,
          currentRejectionReason: null,
          reopenReason,
        },
      }),
    );

    await review.requestCorrection(ADMIN_ID, application.id, {
      documentTypes: [DocumentType.VEHICLE_REGISTRATION_CARD],
      reason: 'The replacement registration card is still unclear.',
    });
    const secondRejectedVrc = currentDocument(
      fixture.documents,
      DocumentType.VEHICLE_REGISTRATION_CARD,
    );
    await documents.upload(
      CITIZEN_ID,
      application.id,
      DocumentType.VEHICLE_REGISTRATION_CARD,
      pdfFile(DocumentType.VEHICLE_REGISTRATION_CARD),
    );
    expect(secondRejectedVrc).toMatchObject({
      isCurrent: false,
      status: DocumentStatus.REJECTED,
    });
    expect(
      currentDocument(
        fixture.documents,
        DocumentType.VEHICLE_REGISTRATION_CARD,
      ),
    ).toMatchObject({
      versionNumber: 3,
      isCurrent: true,
      replacesDocumentId: secondRejectedVrc.id,
      uploadedByUserId: CITIZEN_ID,
      status: DocumentStatus.PENDING,
    });

    await workflow.resubmit(CITIZEN_ID, application.id);
    expect(application.status).toBe(ApplicationStatus.UNDER_REVIEW);
    await review.passReview(ADMIN_ID, application.id);
    expect(application).toMatchObject({
      status: ApplicationStatus.APPROVED,
      referenceNumber,
      applicantSnapshot,
      vehicleSnapshot,
      submittedAt,
      reviewStartedAt: originalReviewStartedAt,
    });
    expect(application.completedAt ?? null).toBeNull();
    expect(fixture.payments).toEqual([paymentBeforeCorrection]);
    expect(fixture.inspections).toEqual(inspectionsBeforeCorrection);
    expect(fixture.stickers).toEqual(stickersBeforeCorrection);
    expect(fixture.timelineEvents).toEqual([
      expect.objectContaining({
        applicationId: application.id,
        eventType: 'DOCUMENTS_APPROVED',
        actorUserId: ADMIN_ID,
        occurredAt: new Date('2026-08-14T03:00:00.000Z'),
      }),
    ]);
    for (const document of fixture.documents.filter(
      (item) => item.applicationId === application.id && item.isCurrent,
    )) {
      expect(document).toMatchObject({
        status: DocumentStatus.APPROVED,
        reviewedByUserId: ADMIN_ID,
        reviewedAt: new Date('2026-08-14T03:00:00.000Z'),
      });
    }

    expect(fixture.history.map(historyTransition)).toEqual([
      'NULL->DRAFT',
      'DRAFT->SUBMITTED',
      'APPROVED->UNDER_REVIEW',
      'UNDER_REVIEW->CORRECTION_REQUIRED',
      'CORRECTION_REQUIRED->UNDER_REVIEW',
      'UNDER_REVIEW->REJECTED',
      'REJECTED->UNDER_REVIEW',
      'UNDER_REVIEW->CORRECTION_REQUIRED',
      'CORRECTION_REQUIRED->UNDER_REVIEW',
      'UNDER_REVIEW->APPROVED',
    ]);
    expect(fixture.history.at(-1)).toMatchObject({
      changedByUserId: ADMIN_ID,
    });
    expect(fixture.history[4]).toMatchObject({
      previousStatus: ApplicationStatus.CORRECTION_REQUIRED,
      newStatus: ApplicationStatus.UNDER_REVIEW,
      changedByUserId: RESUBMITTER_ADMIN_ID,
    });
    expect(fixture.history[5]).toMatchObject({
      previousStatus: ApplicationStatus.UNDER_REVIEW,
      newStatus: ApplicationStatus.REJECTED,
      changedByUserId: ADMIN_ID,
    });
    expect(fixture.history[8]).toMatchObject({
      previousStatus: ApplicationStatus.CORRECTION_REQUIRED,
      newStatus: ApplicationStatus.UNDER_REVIEW,
      changedByUserId: CITIZEN_ID,
    });

    const historyCount = fixture.history.length;
    const auditCount = fixture.auditLogs.length;
    await expect(
      review.startReview(ADMIN_ID, application.id),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.history).toHaveLength(historyCount);
    expect(fixture.auditLogs).toHaveLength(auditCount);
  });
});

function createFixture() {
  const applications: RenewalApplication[] = [];
  const documents: ApplicationDocument[] = [];
  const history: RenewalApplicationStatusHistory[] = [];
  const auditLogs: AuditLog[] = [];
  const payments: Payment[] = [];
  const inspections: Inspection[] = [];
  const stickers: Sticker[] = [];
  const timelineEvents: ApplicationTimelineEvent[] = [];
  const users = [
    {
      id: CITIZEN_ID,
      phone: '010000000',
      email: 'citizen@example.test',
    } as User,
  ];
  const profiles = [
    {
      id: 'profile-id',
      userId: CITIZEN_ID,
      nameKh: 'Citizen Khmer',
      nameEn: 'Citizen English',
      nationalIdNumber: 'NID-123',
      address: 'Phnom Penh',
    } as CitizenProfile,
  ];
  const vehicles = [
    {
      id: VEHICLE_ID,
      linkedCitizenId: CITIZEN_ID,
      registrationNumber: 'REG-123',
      plateNumber: '2A-3146',
      plateCategory: 'PROVINCE',
      plateProvince: 'Phnom Penh',
      plateType: 'PRIVATE',
      vehicleType: 'SUV',
      vehicleClass: VehicleClass.LIGHT,
      inspectionCategoryId: 'category-id',
      classificationVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      classificationVerifiedBy: ADMIN_ID,
      make: 'Toyota',
      model: 'RAV4',
      manufactureYear: 2020,
      chassisNumber: 'CHASSIS-123',
      firstRegistrationDate: '2020-01-01',
      lastInspectionDate: null,
      inspectionExpiryDate: '2026-01-01',
      registeredOwnerNameKh: 'Owner Khmer',
      registeredOwnerNameEn: 'Owner English',
      registeredOwnerPhone: '010000000',
    } as Vehicle,
  ];

  const repositories = new Map<unknown, ReturnType<typeof repository>>([
    [RenewalApplication, repository(applications, 'application')],
    [ApplicationDocument, repository(documents, 'document')],
    [RenewalApplicationStatusHistory, repository(history, 'history')],
    [AuditLog, repository(auditLogs, 'audit')],
    [User, repository(users, 'user')],
    [CitizenProfile, repository(profiles, 'profile')],
    [Vehicle, repository(vehicles, 'vehicle')],
    [Payment, repository(payments, 'payment')],
    [Inspection, repository(inspections, 'inspection')],
    [Sticker, repository(stickers, 'sticker')],
    [ApplicationTimelineEvent, repository(timelineEvents, 'timeline-event')],
  ]);
  const manager = {
    getRepository: (entity: unknown) => repositories.get(entity),
    query: (sql: string) =>
      Promise.resolve(
        sql.includes('now()')
          ? [{ now: new Date('2026-08-14T03:00:00.000Z') }]
          : [{ daysUntilExpiry: 0 }],
      ),
  };
  const dataSource = {
    getRepository: manager.getRepository,
    transaction: <T>(work: (transactionManager: typeof manager) => T) =>
      Promise.resolve(work(manager)),
  };
  let storedFile = 0;
  const filesService = {
    saveApplicationDocument: jest.fn(() =>
      Promise.resolve({
        storageKey: `private/application-document-${++storedFile}.pdf`,
      }),
    ),
    read: jest.fn(() => Promise.resolve(Buffer.from('stored source file'))),
    deleteIfExists: jest.fn(),
  };

  return {
    dataSource,
    filesService,
    applications,
    documents,
    history,
    auditLogs,
    payments,
    inspections,
    stickers,
    timelineEvents,
  };
}

function repository<T extends { id: string }>(rows: T[], prefix: string) {
  let sequence = 0;
  return {
    create: (input: Partial<T>) => ({ ...input }) as T,
    save: (input: T | T[]) =>
      Promise.resolve(Array.isArray(input) ? input.map(save) : save(input)),
    findOne: ({
      where,
      order,
    }: {
      where: Partial<T>;
      order?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
    }) => {
      const matchesWhere = rows.filter((row) => matches(row, where));
      if (order?.versionNumber === 'DESC') {
        matchesWhere.sort(
          (left, right) =>
            Number(right.versionNumber ?? 0) - Number(left.versionNumber ?? 0),
        );
      }
      return Promise.resolve(matchesWhere[0] ?? null);
    },
    find: ({ where }: { where: Partial<T> }) =>
      Promise.resolve(rows.filter((row) => matches(row, where))),
    existsBy: (where: Partial<T>) =>
      Promise.resolve(
        rows.some((row) =>
          Object.entries(where).every(([key, value]) => {
            const rowValue = row[key as keyof T];
            const findOperatorValue = (value as { _value?: unknown })._value;
            if (Array.isArray(findOperatorValue)) {
              return findOperatorValue.includes(rowValue);
            }
            return rowValue === value;
          }),
        ),
      ),
  };

  function save(input: T): T {
    const record = input as T & {
      createdAt?: Date;
      updatedAt?: Date;
      uploadedAt?: Date;
    };
    const now = new Date();
    record.id ||= `${prefix}-${++sequence}`;
    record.createdAt ??= now;
    record.updatedAt ??= now;
    if ('uploadedAt' in record) record.uploadedAt ??= now;
    if (!rows.includes(record)) rows.push(record);
    return record;
  }
}

function matches<T extends object>(row: T, where: Partial<T>): boolean {
  return Object.entries(where).every(
    ([key, value]) => row[key as keyof T] === value,
  );
}

function currentDocument(
  documents: ApplicationDocument[],
  documentType: DocumentType,
): ApplicationDocument {
  const document = documents.find(
    (item) => item.documentType === documentType && item.isCurrent,
  );
  if (document === undefined) throw new Error('Expected current document');
  return document;
}

function historyTransition(history: RenewalApplicationStatusHistory): string {
  return `${history.previousStatus ?? 'NULL'}->${history.newStatus}`;
}

function documentSnapshot(documents: ApplicationDocument[]) {
  return documents.map((document) => ({
    id: document.id,
    documentType: document.documentType,
    versionNumber: document.versionNumber,
    isCurrent: document.isCurrent,
    replacesDocumentId: document.replacesDocumentId,
    status: document.status,
    reviewedByUserId: document.reviewedByUserId,
    reviewedAt: document.reviewedAt?.toISOString() ?? null,
    rejectionReason: document.rejectionReason,
  }));
}

function expiredApplication(): RenewalApplication {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: 'expired-application-id',
    citizenId: CITIZEN_ID,
    vehicleId: VEHICLE_ID,
    status: ApplicationStatus.EXPIRED,
    referenceNumber: 'VIR-20260701-ABCDEF123456',
    applicantSnapshot: { nameKh: 'Old citizen data' },
    vehicleSnapshot: { plateNumber: 'OLD-PLATE' },
    currentCorrectionReason: null,
    currentRejectionReason: null,
    preferredInspectionStationId: 'old-station-id',
    preferredInspectionDate: '2026-07-15',
    submittedAt: new Date('2026-07-01T00:00:00.000Z'),
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
  } as RenewalApplication;
}

function expiredSourceDocument(
  documentType: DocumentType,
): ApplicationDocument {
  return {
    id: `expired-${documentType}`,
    applicationId: 'expired-application-id',
    documentType,
    versionNumber: 2,
    isCurrent: true,
    replacesDocumentId: 'old-document-id',
    uploadedByUserId: CITIZEN_ID,
    storageKey: `expired/${documentType}.pdf`,
    originalFileName: `${documentType.toLowerCase()}.pdf`,
    mimeType: 'application/pdf',
    fileSizeBytes: '24',
    status: DocumentStatus.APPROVED,
    reviewedByUserId: ADMIN_ID,
    reviewedAt: new Date('2026-07-02T00:00:00.000Z'),
    rejectionReason: null,
    uploadedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-02T00:00:00.000Z'),
  } as ApplicationDocument;
}

function pdfFile(documentType: DocumentType) {
  return {
    buffer: Buffer.from(documentType),
    originalname: `${documentType.toLowerCase()}.pdf`,
    mimetype: 'application/pdf',
    size: 100,
  };
}
