import { UserRole } from '../users/enums/user-role.enum';
import { ApplicationDocumentsController } from './application-documents.controller';
import { DocumentType } from './enums/document-type.enum';

const actor = {
  userId: '11111111-1111-4111-8111-111111111111',
  role: UserRole.CITIZEN,
  sessionId: 'session',
} as const;
const applicationId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';

describe('ApplicationDocumentsController', () => {
  it('forwards citizen-scoped upload and query arguments', async () => {
    const service = {
      upload: jest.fn().mockResolvedValue({}),
      listCurrent: jest.fn().mockResolvedValue([]),
      listHistory: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      download: jest.fn().mockResolvedValue({
        document: { mimeType: 'application/pdf', originalFileName: 'a.pdf' },
        content: Buffer.from('x'),
      }),
    };
    const controller = new ApplicationDocumentsController(service as never);
    const file = {
      buffer: Buffer.from('x'),
      originalname: 'a.pdf',
      mimetype: 'application/pdf',
      size: 1,
    };
    await controller.upload(
      actor,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file,
    );
    await controller.listCurrent(actor, applicationId);
    await controller.history(
      actor,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      { page: 1, limit: 20, sortOrder: 'desc' },
    );
    await controller.download(actor, applicationId, documentId, {
      setHeader: jest.fn(),
    } as never);
    expect(service.upload).toHaveBeenCalledWith(
      actor.userId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      file,
    );
    expect(service.listCurrent).toHaveBeenCalledWith(
      actor.userId,
      applicationId,
    );
    expect(service.listHistory).toHaveBeenCalledWith(
      actor.userId,
      applicationId,
      DocumentType.CITIZEN_ID_CARD,
      expect.anything(),
    );
    expect(service.download).toHaveBeenCalledWith(
      actor.userId,
      applicationId,
      documentId,
    );
  });
});
