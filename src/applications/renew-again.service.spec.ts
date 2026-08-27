import { HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import type { FilesService } from '../files/files.service';
import { ApplicationWorkflowService } from './application-workflow.service';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';
import { RenewAgainService } from './renew-again.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const VEHICLE_ID = '44444444-4444-4444-8444-444444444444';

describe('RenewAgainService', () => {
  it('creates an independent draft from an owned EXPIRED source and resets document review state', async () => {
    const fixture = createFixture();
    const sourceBefore = structuredClone(fixture.source);
    const documentsBefore = structuredClone(fixture.sourceDocuments);

    const result = await fixture.service.renewAgain(CITIZEN_ID, SOURCE_ID);

    expect(result).toMatchObject({ id: fixture.draft.id, status: 'DRAFT' });
    expect(fixture.workflow.createDraftWithManager).toHaveBeenCalledWith(
      fixture.manager,
      CITIZEN_ID,
      VEHICLE_ID,
      expect.any(String),
    );
    expect(fixture.files.read).toHaveBeenCalledTimes(3);
    expect(fixture.files.saveApplicationDocument).toHaveBeenCalledTimes(3);
    expect(fixture.createdDocuments).toHaveLength(3);
    for (const source of fixture.sourceDocuments) {
      expect(
        fixture.createdDocuments.find(
          (document) => document.documentType === source.documentType,
        ),
      ).toMatchObject({
        applicationId: fixture.draft.id,
        documentType: source.documentType,
        versionNumber: 1,
        isCurrent: true,
        replacesDocumentId: null,
        uploadedByUserId: CITIZEN_ID,
        originalFileName: source.originalFileName,
        mimeType: source.mimeType,
        fileSizeBytes: source.fileSizeBytes,
        status: DocumentStatus.PENDING,
        reviewedByUserId: null,
        reviewedAt: null,
        rejectionReason: null,
      });
    }
    expect(
      fixture.createdDocuments.map((document) => document.storageKey),
    ).not.toEqual(
      fixture.sourceDocuments.map((document) => document.storageKey),
    );
    expect(fixture.source).toEqual(sourceBefore);
    expect(fixture.sourceDocuments).toEqual(documentsBefore);
    expect(fixture.files.deleteIfExists).not.toHaveBeenCalled();
  });

  it('rejects a source owned by another citizen before reading files', async () => {
    const fixture = createFixture({ citizenId: OTHER_CITIZEN_ID });

    await expect(
      fixture.service.renewAgain(CITIZEN_ID, SOURCE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });
    expect(fixture.files.read).not.toHaveBeenCalled();
    expect(fixture.workflow.createDraftWithManager).not.toHaveBeenCalled();
  });

  it.each([
    ApplicationStatus.DRAFT,
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.INSPECTION_FAILED,
    ApplicationStatus.COMPLETED,
  ])('rejects %s as a Renew Again source', async (status) => {
    const fixture = createFixture({ status });

    await expect(
      fixture.service.renewAgain(CITIZEN_ID, SOURCE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.files.read).not.toHaveBeenCalled();
  });

  it('requires every current required source document', async () => {
    const fixture = createFixture();
    fixture.sourceDocuments.pop();

    await expect(
      fixture.service.renewAgain(CITIZEN_ID, SOURCE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.REQUIRED_DOCUMENTS_MISSING,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.files.read).not.toHaveBeenCalled();
  });

  it('cleans staged copies after a later file copy fails', async () => {
    const fixture = createFixture();
    fixture.files.read
      .mockResolvedValueOnce(Buffer.from('first'))
      .mockRejectedValueOnce(new Error('file unavailable'));

    await expect(
      fixture.service.renewAgain(CITIZEN_ID, SOURCE_ID),
    ).rejects.toThrow('file unavailable');
    expect(fixture.files.deleteIfExists).toHaveBeenCalledWith('new-key-1.pdf');
    expect(fixture.workflow.createDraftWithManager).not.toHaveBeenCalled();
  });

  it('cleans staged copies and maps the existing unfinished-application unique conflict', async () => {
    const fixture = createFixture();
    fixture.workflow.createDraftWithManager.mockRejectedValue({
      code: '23505',
      constraint: 'uq_unfinished_application_per_vehicle',
    });

    await expect(
      fixture.service.renewAgain(CITIZEN_ID, SOURCE_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.UNFINISHED_APPLICATION_ALREADY_EXISTS,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.files.deleteIfExists).toHaveBeenCalledTimes(3);
  });
});

function createFixture(sourceOverrides: Record<string, unknown> = {}) {
  const source = {
    id: SOURCE_ID,
    citizenId: CITIZEN_ID,
    vehicleId: VEHICLE_ID,
    status: ApplicationStatus.EXPIRED,
    referenceNumber: 'VIR-20260801-ABCDEF123456',
    applicantSnapshot: { nameKh: 'Old citizen data' },
    vehicleSnapshot: { registrationNumber: 'OLD-PLATE' },
    preferredInspectionDate: '2026-08-01',
    preferredInspectionStationId: 'old-station',
    submittedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...sourceOverrides,
  } as RenewalApplication;
  const sourceDocuments = [
    sourceDocument(DocumentType.VEHICLE_REGISTRATION_CARD, 'key-a.pdf'),
    sourceDocument(DocumentType.PREVIOUS_INSPECTION_CERTIFICATE, 'key-b.pdf'),
    sourceDocument(DocumentType.CITIZEN_ID_CARD, 'key-c.pdf'),
  ];
  const createdDocuments: ApplicationDocument[] = [];
  const applications = {
    findOne: jest.fn().mockResolvedValue(source),
  };
  const documents = {
    find: jest.fn().mockResolvedValue(sourceDocuments),
    create: jest.fn((input: ApplicationDocument) => input),
    save: jest.fn((input: ApplicationDocument[]) => {
      createdDocuments.push(...input);
      return Promise.resolve(input);
    }),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === RenewalApplication) return applications;
      if (entity === ApplicationDocument) return documents;
      throw new Error('Unexpected repository');
    }),
  };
  const dataSource = {
    getRepository: manager.getRepository,
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  let fileNumber = 0;
  const files = {
    read: jest.fn().mockResolvedValue(Buffer.from('source file')),
    saveApplicationDocument: jest.fn(() =>
      Promise.resolve({ storageKey: `new-key-${++fileNumber}.pdf` }),
    ),
    deleteIfExists: jest.fn().mockResolvedValue(undefined),
  };
  const draft = {
    id: 'new-draft-id',
    citizenId: CITIZEN_ID,
    vehicleId: VEHICLE_ID,
    status: ApplicationStatus.DRAFT,
    referenceNumber: null,
    applicantSnapshot: null,
    vehicleSnapshot: null,
    preferredInspectionDate: null,
    preferredInspectionStationId: null,
    submittedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const workflow = {
    createDraftWithManager: jest.fn().mockResolvedValue(draft),
  };

  return {
    service: new RenewAgainService(
      dataSource as unknown as DataSource,
      files as unknown as FilesService,
      workflow as unknown as ApplicationWorkflowService,
    ),
    source,
    sourceDocuments,
    createdDocuments,
    dataSource,
    manager,
    files,
    workflow,
    draft,
  };
}

function sourceDocument(documentType: DocumentType, storageKey: string) {
  return {
    id: `${documentType}-id`,
    applicationId: SOURCE_ID,
    documentType,
    versionNumber: 4,
    isCurrent: true,
    replacesDocumentId: 'historical-document-id',
    uploadedByUserId: CITIZEN_ID,
    storageKey,
    originalFileName: `${documentType.toLowerCase()}.pdf`,
    mimeType: 'application/pdf',
    fileSizeBytes: '11',
    status: DocumentStatus.REJECTED,
    reviewedByUserId: 'reviewer-id',
    reviewedAt: new Date('2026-08-01T00:00:00.000Z'),
    rejectionReason: 'Old review decision',
  } as ApplicationDocument;
}
