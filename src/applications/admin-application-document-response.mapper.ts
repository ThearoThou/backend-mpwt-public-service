import { ApplicationDocument } from './entities/application-document.entity';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';

export interface AdminApplicationDocumentResponse {
  id: string;
  applicationId: string;
  documentType: DocumentType;
  versionNumber: number;
  isCurrent: boolean;
  replacesDocumentId: string | null;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: string;
  status: DocumentStatus;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminApplicationDocumentSource = Pick<
  ApplicationDocument,
  | 'id'
  | 'applicationId'
  | 'documentType'
  | 'versionNumber'
  | 'isCurrent'
  | 'replacesDocumentId'
  | 'originalFileName'
  | 'mimeType'
  | 'fileSizeBytes'
  | 'status'
  | 'reviewedByUserId'
  | 'reviewedAt'
  | 'rejectionReason'
  | 'uploadedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export function mapAdminApplicationDocument(
  document: AdminApplicationDocumentSource,
): AdminApplicationDocumentResponse {
  return {
    id: document.id,
    applicationId: document.applicationId,
    documentType: document.documentType,
    versionNumber: document.versionNumber,
    isCurrent: document.isCurrent,
    replacesDocumentId: document.replacesDocumentId,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    fileSizeBytes: document.fileSizeBytes,
    status: document.status,
    reviewedByUserId: document.reviewedByUserId,
    reviewedAt: document.reviewedAt,
    rejectionReason: document.rejectionReason,
    uploadedAt: document.uploadedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
