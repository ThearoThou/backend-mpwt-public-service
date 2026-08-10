import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { IsNull, Not, type Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { AdminApplicationDocumentsService } from './admin-application-documents.service';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('AdminApplicationDocumentsService', () => {
  it('lists only current documents in document-type order after submitted scope validation', async () => {
    const fixture = createFixture();
    const service = createService(fixture);

    const result = await service.listCurrent(APPLICATION_ID);

    expectSubmittedScope(fixture, APPLICATION_ID);
    expect(fixture.documents.find).toHaveBeenCalledWith({
      where: { applicationId: APPLICATION_ID, isCurrent: true },
      order: { documentType: 'ASC' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: DOCUMENT_ID,
        reviewedByUserId: 'admin-id',
      }),
    );
  });

  it('returns paginated document history with deterministic version ordering', async () => {
    const fixture = createFixture();
    const service = createService(fixture);

    const result = await service.listHistory(
      APPLICATION_ID,
      DocumentType.CITIZEN_ID_CARD,
      { page: 2, limit: 10, sortOrder: 'desc' },
    );

    expectSubmittedScope(fixture, APPLICATION_ID);
    expect(fixture.documents.findAndCount).toHaveBeenCalledWith({
      where: {
        applicationId: APPLICATION_ID,
        documentType: DocumentType.CITIZEN_ID_CARD,
      },
      order: { versionNumber: 'DESC', uploadedAt: 'DESC', id: 'DESC' },
      skip: 10,
      take: 10,
    });
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('reads a private document scoped by both document and application IDs', async () => {
    const fixture = createFixture();
    fixture.files.read.mockResolvedValue(Buffer.from('private-content'));
    const service = createService(fixture);

    const result = await service.download(APPLICATION_ID, DOCUMENT_ID);

    expectSubmittedScope(fixture, APPLICATION_ID);
    expect(fixture.documents.findOne).toHaveBeenCalledWith({
      where: { id: DOCUMENT_ID, applicationId: APPLICATION_ID },
    });
    expect(fixture.files.read).toHaveBeenCalledWith('private/document.pdf');
    expect(result.content).toEqual(Buffer.from('private-content'));
  });

  it('returns document-not-found when the document is absent or belongs to another application', async () => {
    const fixture = createFixture();
    fixture.documents.findOne.mockResolvedValue(null);
    const service = createService(fixture);

    await expect(
      service.download(APPLICATION_ID, DOCUMENT_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_DOCUMENT_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('hides never-submitted applications with application-not-found before document reads', async () => {
    const fixture = createFixture();
    fixture.applications.findOne.mockResolvedValue(null);
    const service = createService(fixture);

    await expect(service.listCurrent(APPLICATION_ID)).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
    expect(fixture.documents.find).not.toHaveBeenCalled();
  });

  it('maps unavailable private files to the safe internal error', async () => {
    const fixture = createFixture();
    fixture.files.read.mockRejectedValue(new Error('ENOENT'));
    const service = createService(fixture);

    await expect(
      service.download(APPLICATION_ID, DOCUMENT_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Stored document file is unavailable',
    });
  });
});

function createService(fixture: ReturnType<typeof createFixture>) {
  return new AdminApplicationDocumentsService(
    fixture.applications as unknown as Repository<never>,
    fixture.documents as unknown as Repository<never>,
    fixture.files as never,
  );
}

function createFixture() {
  const document = applicationDocument();
  return {
    applications: {
      findOne: jest.fn().mockResolvedValue({ id: APPLICATION_ID }),
    },
    documents: {
      find: jest.fn().mockResolvedValue([document]),
      findAndCount: jest.fn().mockResolvedValue([[document], 1]),
      findOne: jest.fn().mockResolvedValue(document),
    },
    files: { read: jest.fn() },
  };
}

function expectSubmittedScope(
  fixture: ReturnType<typeof createFixture>,
  applicationId: string,
) {
  expect(fixture.applications.findOne).toHaveBeenCalledWith({
    where: { id: applicationId, submittedAt: Not(IsNull()) },
  });
}

function applicationDocument() {
  return {
    id: DOCUMENT_ID,
    applicationId: APPLICATION_ID,
    documentType: DocumentType.CITIZEN_ID_CARD,
    versionNumber: 1,
    isCurrent: true,
    replacesDocumentId: null,
    originalFileName: 'document.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: '1024',
    status: DocumentStatus.APPROVED,
    reviewedByUserId: 'admin-id',
    reviewedAt: new Date('2026-08-10T00:00:00.000Z'),
    rejectionReason: null,
    uploadedAt: new Date('2026-08-09T00:00:00.000Z'),
    createdAt: new Date('2026-08-09T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    storageKey: 'private/document.pdf',
  };
}
