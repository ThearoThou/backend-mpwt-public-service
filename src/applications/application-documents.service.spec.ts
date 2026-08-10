import { ApplicationDocumentsService } from './application-documents.service';
import { DocumentType } from './enums/document-type.enum';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { RenewalApplication } from './entities/renewal-application.entity';

const citizenId = '11111111-1111-4111-8111-111111111111';
const applicationId = '22222222-2222-4222-8222-222222222222';

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
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
