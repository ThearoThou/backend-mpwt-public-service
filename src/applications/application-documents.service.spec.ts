import { ApplicationDocumentsService } from './application-documents.service';
import { DocumentType } from './enums/document-type.enum';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { RenewalApplication } from './entities/renewal-application.entity';

const citizenId = '11111111-1111-4111-8111-111111111111';
const applicationId = '22222222-2222-4222-8222-222222222222';

type StoredDocument = {
  id: string;
  applicationId: string;
  documentType: DocumentType;
  versionNumber: number;
  isCurrent: boolean;
  replacesDocumentId: string | null;
  uploadedByUserId: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: string;
  status: DocumentStatus;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

describe('ApplicationDocumentsService upload preflight', () => {
  it('rejects a missing application before saving a file', async () => {
    const files = {
      saveApplicationDocument: jest.fn(),
      deleteIfExists: jest.fn(),
    };
    const service = new ApplicationDocumentsService(
      dataSource(null) as never,
      files as never,
    );
    await expect(
      service.upload(
        citizenId,
        applicationId,
        DocumentType.CITIZEN_ID_CARD,
        file(),
      ),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_FOUND' });
    expect(files.saveApplicationDocument).not.toHaveBeenCalled();
  });

  it('rejects an invalid status before saving a file', async () => {
    const files = {
      saveApplicationDocument: jest.fn(),
      deleteIfExists: jest.fn(),
    };
    const service = new ApplicationDocumentsService(
      dataSource({ citizenId, status: 'COMPLETED' }) as never,
      files as never,
    );
    await expect(
      service.upload(
        citizenId,
        applicationId,
        DocumentType.CITIZEN_ID_CARD,
        file(),
      ),
    ).rejects.toMatchObject({
      code: 'APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED',
    });
    expect(files.saveApplicationDocument).not.toHaveBeenCalled();
  });

  it('rejects another citizen before filesystem write', async () => {
    const files = {
      saveApplicationDocument: jest.fn(),
      deleteIfExists: jest.fn(),
    };
    const service = new ApplicationDocumentsService(
      dataSource({
        citizenId: 'other',
        status: ApplicationStatus.DRAFT,
      }) as never,
      files as never,
    );
    await expect(
      service.upload(
        citizenId,
        applicationId,
        DocumentType.CITIZEN_ID_CARD,
        file(),
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_OWNED' });
    expect(files.saveApplicationDocument).not.toHaveBeenCalled();
  });

  it.each([
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
  ])('accepts a valid %s file', async (extension, mimetype) => {
    const fixture = uploadFixture();
    await fixture.service.upload(
      citizenId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file(extension, mimetype),
    );
    expect(fixture.files.saveApplicationDocument).toHaveBeenCalled();
    expect(fixture.documents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        versionNumber: 1,
        isCurrent: true,
        replacesDocumentId: null,
        uploadedByUserId: citizenId,
        status: DocumentStatus.PENDING,
        storageKey: 'new-key',
      }),
    );
  });

  it('versions draft replacements, keeps history, and leaves other types current', async () => {
    const fixture = draftReplacementFixture();

    await fixture.service.upload(
      citizenId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file(),
    );
    await fixture.service.upload(
      citizenId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file(),
    );
    await fixture.service.upload(
      citizenId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file(),
    );

    expect(fixture.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentType: DocumentType.CITIZEN_ID_CARD,
          versionNumber: 1,
          isCurrent: false,
          replacesDocumentId: null,
        }),
        expect.objectContaining({
          documentType: DocumentType.CITIZEN_ID_CARD,
          versionNumber: 2,
          isCurrent: false,
          replacesDocumentId: 'document-1',
        }),
        expect.objectContaining({
          documentType: DocumentType.CITIZEN_ID_CARD,
          versionNumber: 3,
          isCurrent: true,
          replacesDocumentId: 'document-2',
        }),
        expect.objectContaining({
          documentType: DocumentType.VEHICLE_REGISTRATION_CARD,
          versionNumber: 1,
          isCurrent: true,
        }),
      ]),
    );

    const history = await fixture.service.listHistory(
      citizenId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      { page: 1, limit: 20 },
    );
    expect(history.data.map((document) => document.versionNumber)).toEqual([
      3, 2, 1,
    ]);

    const current = await fixture.service.listCurrent(citizenId, applicationId);
    expect(current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentType: DocumentType.CITIZEN_ID_CARD,
          versionNumber: 3,
          isCurrent: true,
        }),
        expect.objectContaining({
          documentType: DocumentType.VEHICLE_REGISTRATION_CARD,
          versionNumber: 1,
          isCurrent: true,
        }),
      ]),
    );
    expect(
      current.filter(
        (document) => document.documentType === DocumentType.CITIZEN_ID_CARD,
      ),
    ).toHaveLength(1);
  });

  it('does not allow another citizen to replace a draft document', async () => {
    const fixture = draftReplacementFixture();
    await fixture.service.upload(
      citizenId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file(),
    );

    await expect(
      fixture.service.upload(
        'other-citizen',
        applicationId,
        DocumentType.CITIZEN_ID_CARD,
        file(),
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_OWNED' });
    expect(fixture.files.saveApplicationDocument).toHaveBeenCalledTimes(1);
  });

  it.each([
    'uq_application_documents_application_document_type_version',
    'uq_current_document_per_type',
  ])(
    'maps relevant PostgreSQL unique conflict %s and cleans only new key',
    async (constraint) => {
      const fixture = uploadFixture();
      fixture.source.transaction.mockRejectedValue({
        code: '23505',
        constraint,
      });
      await expect(
        fixture.service.upload(
          citizenId,
          applicationId,
          DocumentType.CITIZEN_ID_CARD,
          file(),
        ),
      ).rejects.toMatchObject({
        code: 'APPLICATION_DOCUMENT_ALREADY_EXISTS',
        status: 409,
      });
      expect(fixture.files.deleteIfExists).toHaveBeenCalledWith('new-key');
    },
  );

  it.each([
    [0, 'pdf', 'application/pdf'],
    [5242881, 'pdf', 'application/pdf'],
    [1, 'exe', 'application/octet-stream'],
    [1, 'pdf', 'image/jpeg'],
  ])('rejects invalid file metadata', async (size, extension, mimetype) => {
    const fixture = uploadFixture();
    await expect(
      fixture.service.upload(
        citizenId,
        applicationId,
        DocumentType.CITIZEN_ID_CARD,
        file(extension, mimetype, size),
      ),
    ).rejects.toMatchObject({ code: 'DOCUMENT_FILE_INVALID' });
    expect(fixture.files.saveApplicationDocument).not.toHaveBeenCalled();
  });

  it.each([
    [DocumentStatus.REJECTED, true],
    [DocumentStatus.APPROVED, false],
    [null, true],
  ])(
    'allows correction-required upload only for a rejected or missing current document',
    async (currentStatus, allowed) => {
      const fixture = correctionUploadFixture(currentStatus);
      const upload = fixture.service.upload(
        citizenId,
        applicationId,
        DocumentType.CITIZEN_ID_CARD,
        file(),
      );

      if (allowed) {
        await expect(upload).resolves.toBeDefined();
        expect(fixture.files.saveApplicationDocument).toHaveBeenCalledTimes(1);
      } else {
        await expect(upload).rejects.toMatchObject({
          code: 'APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED',
        });
        expect(fixture.files.saveApplicationDocument).not.toHaveBeenCalled();
      }
    },
  );
});
function dataSource(application: unknown) {
  return {
    getRepository: () => ({
      findOne: jest.fn().mockResolvedValue(application),
    }),
  };
}
function file(extension = 'PDF', mimetype = 'application/pdf', size = 1) {
  return {
    buffer: Buffer.from('x'),
    originalname: `id.${extension}`,
    mimetype,
    size,
  };
}
function uploadFixture() {
  const application = {
    id: applicationId,
    citizenId,
    status: ApplicationStatus.DRAFT,
  };
  const applications = { findOne: jest.fn().mockResolvedValue(application) };
  const documents = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((x: Record<string, unknown>) => ({
      id: 'new-id',
      ...x,
      uploadedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    save: jest.fn((x) => Promise.resolve(x)),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === RenewalApplication ? applications : documents,
    ),
  };
  const source = {
    getRepository: jest.fn(() => applications),
    transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  const files = {
    saveApplicationDocument: jest
      .fn()
      .mockResolvedValue({ storageKey: 'new-key' }),
    deleteIfExists: jest.fn(),
  };
  return {
    service: new ApplicationDocumentsService(source as never, files as never),
    files,
    documents,
    source,
  };
}

function correctionUploadFixture(currentStatus: DocumentStatus | null) {
  const application = {
    id: applicationId,
    citizenId,
    status: ApplicationStatus.CORRECTION_REQUIRED,
  };
  const current =
    currentStatus === null
      ? null
      : {
          id: 'current-document-id',
          applicationId,
          documentType: DocumentType.CITIZEN_ID_CARD,
          isCurrent: true,
          versionNumber: 1,
          status: currentStatus,
        };
  const applications = { findOne: jest.fn().mockResolvedValue(application) };
  const documents = {
    findOne: jest.fn().mockResolvedValue(current),
    create: jest.fn((input: Record<string, unknown>) => ({
      id: 'new-document-id',
      ...input,
      uploadedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === RenewalApplication ? applications : documents,
    ),
  };
  const source = {
    getRepository: jest.fn((entity) =>
      entity === RenewalApplication ? applications : documents,
    ),
    transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  const files = {
    saveApplicationDocument: jest
      .fn()
      .mockResolvedValue({ storageKey: 'new-key' }),
    deleteIfExists: jest.fn(),
  };
  return {
    service: new ApplicationDocumentsService(source as never, files as never),
    files,
  };
}

function draftReplacementFixture() {
  const application = {
    id: applicationId,
    citizenId,
    status: ApplicationStatus.DRAFT,
  };
  const documents: StoredDocument[] = [
    document({
      id: 'registration-document',
      documentType: DocumentType.VEHICLE_REGISTRATION_CARD,
      versionNumber: 1,
    }),
  ];
  let nextDocumentId = 1;
  const applications = { findOne: jest.fn().mockResolvedValue(application) };
  const documentRepository = {
    findOne: jest.fn(({ where }: { where: Partial<StoredDocument> }) =>
      Promise.resolve(
        documents.find((document) => matches(document, where)) ?? null,
      ),
    ),
    find: jest.fn(({ where }: { where: Partial<StoredDocument> }) =>
      Promise.resolve(
        documents
          .filter((document) => matches(document, where))
          .sort((left, right) =>
            left.documentType.localeCompare(right.documentType),
          ),
      ),
    ),
    findAndCount: jest.fn(({ where }: { where: Partial<StoredDocument> }) => {
      const matching = documents
        .filter((document) => matches(document, where))
        .sort((left, right) => right.versionNumber - left.versionNumber);
      return Promise.resolve([matching, matching.length] as const);
    }),
    create: jest.fn((input: Record<string, unknown>) =>
      document({
        id: `document-${nextDocumentId++}`,
        ...(input as Partial<StoredDocument>),
      }),
    ),
    save: jest.fn((value: StoredDocument) => {
      const existingIndex = documents.findIndex(
        (document) => document.id === value.id,
      );
      if (existingIndex === -1) documents.push(value);
      else documents[existingIndex] = value;
      return Promise.resolve(value);
    }),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === RenewalApplication ? applications : documentRepository,
    ),
  };
  const source = {
    getRepository: jest.fn((entity) =>
      entity === RenewalApplication ? applications : documentRepository,
    ),
    transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  const files = {
    saveApplicationDocument: jest
      .fn()
      .mockResolvedValue({ storageKey: 'new-key' }),
    deleteIfExists: jest.fn(),
  };
  return {
    service: new ApplicationDocumentsService(source as never, files as never),
    files,
    documents,
  };
}

function document(input: Partial<StoredDocument> & Pick<StoredDocument, 'id'>) {
  const now = new Date();
  return {
    applicationId,
    isCurrent: true,
    replacesDocumentId: null,
    uploadedByUserId: citizenId,
    storageKey: 'existing-key',
    originalFileName: 'existing.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: '1',
    status: DocumentStatus.PENDING,
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
    ...input,
  } satisfies StoredDocument;
}

function matches(document: StoredDocument, where: Partial<StoredDocument>) {
  return (Object.keys(where) as Array<keyof StoredDocument>).every(
    (key) => document[key] === where[key],
  );
}
