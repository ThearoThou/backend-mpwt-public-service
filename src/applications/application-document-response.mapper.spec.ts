import { mapApplicationDocument } from './application-document-response.mapper';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';

it.each([
  [DocumentStatus.REJECTED, 'Image is not readable.'],
  [DocumentStatus.APPROVED, null],
  [DocumentStatus.PENDING, null],
])('maps %s with its document rejection reason', (status, rejectionReason) => {
  const mapped = mapApplicationDocument({
    id: 'id',
    applicationId: 'application-id',
    documentType: DocumentType.CITIZEN_ID_CARD,
    versionNumber: 1,
    isCurrent: true,
    replacesDocumentId: null,
    originalFileName: 'id.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: '3',
    status,
    rejectionReason,
    uploadedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    storageKey: 'secret',
    uploadedByUserId: 'user',
    reviewedByUserId: 'reviewer',
  } as never);
  expect(mapped).toEqual(
    expect.objectContaining({
      id: 'id',
      applicationId: 'application-id',
      status,
      rejectionReason,
    }),
  );
  expect(mapped).not.toHaveProperty('storageKey');
  expect(mapped).not.toHaveProperty('uploadedByUserId');
  expect(mapped).not.toHaveProperty('reviewedByUserId');
});
