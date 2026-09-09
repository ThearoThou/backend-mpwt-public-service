import { ApplicationDocument } from './entities/application-document.entity';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';

export interface ApplicationDocumentResponse {
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
  rejectionReason: string | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function mapApplicationDocument(
  document: ApplicationDocument,
): ApplicationDocumentResponse {
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
    rejectionReason: document.rejectionReason,
    uploadedAt: document.uploadedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
