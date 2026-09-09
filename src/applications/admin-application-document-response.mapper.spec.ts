import { mapAdminApplicationDocument } from './admin-application-document-response.mapper';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';

describe('admin application document response mapper', () => {
  it('includes review metadata but never exposes storageKey', () => {
    const mapped = mapAdminApplicationDocument({
      id: 'document-id',
      applicationId: 'application-id',
      documentType: DocumentType.CITIZEN_ID_CARD,
      versionNumber: 2,
      isCurrent: true,
      replacesDocumentId: 'previous-document-id',
      uploadedByUserId: 'uploader-admin-id',
      originalFileName: 'citizen-id.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: '1024',
      status: DocumentStatus.REJECTED,
      reviewedByUserId: 'admin-id',
      reviewedAt: new Date('2026-08-10T00:00:00.000Z'),
      rejectionReason: 'Image is not readable.',
      uploadedAt: new Date('2026-08-09T00:00:00.000Z'),
      createdAt: new Date('2026-08-09T00:00:00.000Z'),
      updatedAt: new Date('2026-08-10T00:00:00.000Z'),
      storageKey: 'application-documents/private.pdf',
    } as never);

    expect(mapped).toEqual(
      expect.objectContaining({
        reviewedByUserId: 'admin-id',
        uploadedByUserId: 'uploader-admin-id',
        rejectionReason: 'Image is not readable.',
      }),
    );
    expect(mapped).not.toHaveProperty('storageKey');
  });
});
