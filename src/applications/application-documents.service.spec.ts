import { ApplicationDocumentsService } from './application-documents.service';
import { DocumentType } from './enums/document-type.enum';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { RenewalApplication } from './entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';

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
  rejectionReason: string | null;
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
    const rejectedVersion = fixture.documents.find(
      (document) => document.id === 'document-1',
    )!;
    rejectedVersion.status = DocumentStatus.REJECTED;
    rejectedVersion.rejectionReason = 'Document image is unclear';
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
    expect(history.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          versionNumber: 1,
          status: DocumentStatus.REJECTED,
          rejectionReason: 'Document image is unclear',
        }),
      ]),
    );

    const current = await fixture.service.listCurrent(citizenId, applicationId);
    expect(current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentType: DocumentType.CITIZEN_ID_CARD,
          versionNumber: 3,
          isCurrent: true,
          status: DocumentStatus.PENDING,
          rejectionReason: null,
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

  it('deletes only a current draft document and removes its stored file', async () => {
    const fixture = draftReplacementFixture();
    await fixture.service.upload(
      citizenId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file(),
    );
    const current = fixture.documents.find(
      (document) => document.documentType === DocumentType.CITIZEN_ID_CARD,
    );
    expect(current).toBeDefined();

    await fixture.service.delete(citizenId, applicationId, current!.id);

    expect(fixture.documents).not.toContainEqual(current);
    expect(fixture.files.deleteIfExists).toHaveBeenCalledWith('new-key');
  });

  it.each([ApplicationStatus.CORRECTION_REQUIRED, ApplicationStatus.SUBMITTED])(
    'does not allow deleting a document when the application is %s',
    async (status) => {
      const fixture = draftReplacementFixture();
      fixture.application.status = status;

      await expect(
        fixture.service.delete(
          citizenId,
          applicationId,
          'registration-document',
        ),
      ).rejects.toMatchObject({
        code: 'APPLICATION_DOCUMENT_DELETE_NOT_ALLOWED',
      });
      expect(fixture.files.deleteIfExists).not.toHaveBeenCalled();
    },
  );

  it('canonically expires a correction upload on Day 31 before storing a file', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-06T17:00:00.000Z'));
    try {
      const fixture = correctionUploadFixture(
        DocumentStatus.REJECTED,
        new Date('2026-09-07T08:30:00.000Z'),
      );

      await expect(
        fixture.service.upload(
          citizenId,
          applicationId,
          DocumentType.CITIZEN_ID_CARD,
          file(),
        ),
      ).rejects.toMatchObject({
        code: 'APPLICATION_INVALID_TRANSITION',
        status: 409,
      });

      expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
      expect(fixture.files.saveApplicationDocument).not.toHaveBeenCalled();
      expect(fixture.history.save).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('creates an admin-uploaded pending replacement without changing application status', async () => {
    const adminId = '33333333-3333-4333-8333-333333333333';
    const fixture = correctionUploadFixture(DocumentStatus.REJECTED);
    fixture.current!.rejectionReason = 'The original image is unclear.';

    const result = await fixture.service.uploadAsAdmin(
      adminId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file(),
    );

    expect(fixture.current).toMatchObject({
      isCurrent: false,
      rejectionReason: 'The original image is unclear.',
    });
    expect(result).toMatchObject({
      versionNumber: 2,
      isCurrent: true,
      replacesDocumentId: 'current-document-id',
      uploadedByUserId: adminId,
      status: DocumentStatus.PENDING,
      rejectionReason: null,
    });
    expect(fixture.application.status).toBe(
      ApplicationStatus.CORRECTION_REQUIRED,
    );
  });

  it('does not allow an admin to upload into a draft application', async () => {
    const fixture = uploadFixture();

    await expect(
      fixture.service.uploadAsAdmin(
        '33333333-3333-4333-8333-333333333333',
        applicationId,
        DocumentType.CITIZEN_ID_CARD,
        file(),
      ),
    ).rejects.toMatchObject({
      code: 'APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED',
      status: 409,
    });
    expect(fixture.files.saveApplicationDocument).not.toHaveBeenCalled();
  });

  it.each([DocumentStatus.APPROVED, DocumentStatus.PENDING])(
    'does not allow an admin to replace a current %s document',
    async (status) => {
      const fixture = correctionUploadFixture(status);

      await expect(
        fixture.service.uploadAsAdmin(
          '33333333-3333-4333-8333-333333333333',
          applicationId,
          DocumentType.CITIZEN_ID_CARD,
          file(),
        ),
      ).rejects.toMatchObject({
        code: 'APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED',
        status: 409,
      });
      expect(fixture.files.saveApplicationDocument).not.toHaveBeenCalled();
    },
  );

  it('canonically expires an admin correction upload and does not retain its file', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-06T17:00:00.000Z'));
    try {
      const fixture = correctionUploadFixture(
        DocumentStatus.REJECTED,
        new Date('2026-09-07T08:30:00.000Z'),
      );

      await expect(
        fixture.service.uploadAsAdmin(
          '33333333-3333-4333-8333-333333333333',
          applicationId,
          DocumentType.CITIZEN_ID_CARD,
          file(),
        ),
      ).rejects.toMatchObject({
        code: 'APPLICATION_INVALID_TRANSITION',
        status: 409,
      });
      expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
      expect(fixture.files.saveApplicationDocument).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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
    [DocumentStatus.PENDING, false],
    [null, false],
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

  it('serializes concurrent citizen/admin replacement to one current next version', async () => {
    const fixture = draftReplacementFixture();
    fixture.application.status = ApplicationStatus.CORRECTION_REQUIRED;
    fixture.documents[0].status = DocumentStatus.REJECTED;
    fixture.documents[0].rejectionReason = 'Replace this document.';
    let storedFileNumber = 0;
    fixture.files.saveApplicationDocument.mockImplementation(() =>
      Promise.resolve({ storageKey: `new-key-${++storedFileNumber}` }),
    );
    serializeDocumentTransactions(fixture);

    const results = await Promise.allSettled([
      fixture.service.upload(
        citizenId,
        applicationId,
        DocumentType.VEHICLE_REGISTRATION_CARD,
        file(),
      ),
      fixture.service.uploadAsAdmin(
        '33333333-3333-4333-8333-333333333333',
        applicationId,
        DocumentType.VEHICLE_REGISTRATION_CARD,
        file(),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({
      status: 'rejected',
      reason: { code: 'APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED' },
    });
    expect(fixture.documents.filter((document) => document.isCurrent)).toEqual([
      expect.objectContaining({
        versionNumber: 2,
        status: DocumentStatus.PENDING,
      }),
    ]);
    expect(
      fixture.documents.filter((document) => document.versionNumber === 2),
    ).toHaveLength(1);
    expect(fixture.files.deleteIfExists).toHaveBeenCalledTimes(1);
  });
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
    submittedAt: new Date(),
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

function correctionUploadFixture(
  currentStatus: DocumentStatus | null,
  submittedAt = new Date(),
) {
  const application = {
    id: applicationId,
    citizenId,
    status: ApplicationStatus.CORRECTION_REQUIRED,
    submittedAt,
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
          rejectionReason: null as string | null,
        };
  const applications = {
    findOne: jest.fn().mockResolvedValue(application),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const history = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
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
    getRepository: jest.fn((entity) => {
      if (entity === RenewalApplication) return applications;
      if (entity === RenewalApplicationStatusHistory) return history;
      return documents;
    }),
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
    application,
    history,
    current,
    documents,
  };
}

function draftReplacementFixture() {
  const application = {
    id: applicationId,
    citizenId,
    status: ApplicationStatus.DRAFT,
    submittedAt: new Date(),
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
    findOne: jest.fn(
      ({
        where,
        order,
      }: {
        where: Partial<StoredDocument>;
        order?: { versionNumber?: 'ASC' | 'DESC' };
      }) => {
        const matching = documents.filter((document) =>
          matches(document, where),
        );
        if (order?.versionNumber === 'DESC') {
          matching.sort(
            (left, right) => right.versionNumber - left.versionNumber,
          );
        }
        return Promise.resolve(matching[0] ?? null);
      },
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
    remove: jest.fn((value: StoredDocument) => {
      const index = documents.findIndex((document) => document.id === value.id);
      if (index !== -1) documents.splice(index, 1);
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
    application,
    manager,
    source,
  };
}

function serializeDocumentTransactions(
  fixture: ReturnType<typeof draftReplacementFixture>,
) {
  let previous = Promise.resolve();
  fixture.source.transaction.mockImplementation(
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
    rejectionReason: null,
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
