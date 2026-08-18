import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { FilesService } from '../files/files.service';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import {
  mapApplicationDocument,
  type ApplicationDocumentResponse,
} from './application-document-response.mapper';
import { type BasePaginationQueryDto } from '../common/pagination/base-pagination-query.dto';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';

export interface UploadedApplicationFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const DOCUMENT_VERSION_UNIQUE_INDEX =
  'uq_application_documents_application_document_type_version';
const CURRENT_DOCUMENT_UNIQUE_INDEX = 'uq_current_document_per_type';
const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

@Injectable()
export class ApplicationDocumentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly filesService: FilesService,
  ) {}

  async upload(
    citizenId: string,
    applicationId: string,
    documentType: DocumentType,
    file: UploadedApplicationFile | undefined,
  ): Promise<ApplicationDocumentResponse> {
    const extension = this.validateFile(file);
    await this.assertUploadPreflight(citizenId, applicationId, documentType);
    const stored = await this.filesService.saveApplicationDocument(
      applicationId,
      file!.buffer,
      extension,
    );
    try {
      return await this.dataSource.transaction((manager) =>
        this.uploadWithManager(
          manager,
          citizenId,
          applicationId,
          documentType,
          file!,
          stored.storageKey,
        ),
      );
    } catch (error) {
      await this.filesService.deleteIfExists(stored.storageKey);
      if (this.isDocumentUniqueConflict(error)) {
        throw new DomainException(
          ApiErrorCode.APPLICATION_DOCUMENT_ALREADY_EXISTS,
          HttpStatus.CONFLICT,
          'A current document of this type already exists',
        );
      }
      throw error;
    }
  }

  async listCurrent(citizenId: string, applicationId: string) {
    await this.assertOwnedApplication(citizenId, applicationId);
    const documents = await this.dataSource
      .getRepository(ApplicationDocument)
      .find({
        where: { applicationId, isCurrent: true },
        order: { documentType: 'ASC' },
      });
    return documents.map(mapApplicationDocument);
  }

  async listHistory(
    citizenId: string,
    applicationId: string,
    documentType: DocumentType,
    input: BasePaginationQueryDto,
  ) {
    await this.assertOwnedApplication(citizenId, applicationId);
    const [documents, total] = await this.dataSource
      .getRepository(ApplicationDocument)
      .findAndCount({
        where: { applicationId, documentType },
        order: { versionNumber: 'DESC', uploadedAt: 'DESC', id: 'DESC' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      });
    return {
      data: documents.map(mapApplicationDocument),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async download(citizenId: string, applicationId: string, documentId: string) {
    await this.assertOwnedApplication(citizenId, applicationId);
    const document = await this.dataSource
      .getRepository(ApplicationDocument)
      .findOne({
        where: { id: documentId, applicationId },
      });
    if (document === null) throw this.documentNotFound();
    try {
      return {
        document,
        content: await this.filesService.read(document.storageKey),
      };
    } catch {
      throw new DomainException(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Stored document file is unavailable',
      );
    }
  }

  private async uploadWithManager(
    manager: EntityManager,
    citizenId: string,
    applicationId: string,
    documentType: DocumentType,
    file: UploadedApplicationFile,
    storageKey: string,
  ): Promise<ApplicationDocumentResponse> {
    const applications = manager.getRepository(RenewalApplication);
    const application = await applications.findOne({
      where: { id: applicationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (application === null) throw this.applicationNotFound();
    if (application.citizenId !== citizenId) throw this.notOwned();
    if (
      ![
        ApplicationStatus.DRAFT,
        ApplicationStatus.CORRECTION_REQUIRED,
      ].includes(application.status)
    ) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED,
        HttpStatus.CONFLICT,
        'Document upload is not allowed for the current application status',
      );
    }
    const documents = manager.getRepository(ApplicationDocument);
    const current = await documents.findOne({
      where: { applicationId, documentType, isCurrent: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      current !== null &&
      application.status === ApplicationStatus.CORRECTION_REQUIRED &&
      current.status !== DocumentStatus.REJECTED
    ) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED,
        HttpStatus.CONFLICT,
        'Only rejected documents can be replaced while correction is required',
      );
    }
    if (current !== null) {
      current.isCurrent = false;
      await documents.save(current);
    }
    const document = await documents.save(
      documents.create({
        applicationId,
        documentType,
        versionNumber: current === null ? 1 : current.versionNumber + 1,
        isCurrent: true,
        replacesDocumentId: current?.id ?? null,
        uploadedByUserId: citizenId,
        storageKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: String(file.size),
        status: DocumentStatus.PENDING,
      }),
    );
    return mapApplicationDocument(document);
  }

  private validateFile(file: UploadedApplicationFile | undefined): string {
    if (file === undefined || file.size <= 0 || file.size > MAX_FILE_SIZE)
      throw this.invalidFile();
    const match = /\.([A-Za-z0-9]+)$/.exec(file.originalname);
    const extension = match?.[1]?.toLowerCase();
    if (extension === undefined || FILE_TYPES[extension] !== file.mimetype)
      throw this.invalidFile();
    return extension;
  }

  private async assertOwnedApplication(
    citizenId: string,
    applicationId: string,
  ): Promise<void> {
    const application = await this.dataSource
      .getRepository(RenewalApplication)
      .findOne({ where: { id: applicationId } });
    if (application === null) throw this.applicationNotFound();
    if (application.citizenId !== citizenId) throw this.notOwned();
  }
  private async assertUploadPreflight(
    citizenId: string,
    applicationId: string,
    documentType: DocumentType,
  ): Promise<void> {
    const application = await this.dataSource
      .getRepository(RenewalApplication)
      .findOne({ where: { id: applicationId } });
    if (application === null) throw this.applicationNotFound();
    if (application.citizenId !== citizenId) throw this.notOwned();
    if (
      ![
        ApplicationStatus.DRAFT,
        ApplicationStatus.CORRECTION_REQUIRED,
      ].includes(application.status)
    ) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED,
        HttpStatus.CONFLICT,
        'Document upload is not allowed for the current application status',
      );
    }
    if (application.status === ApplicationStatus.CORRECTION_REQUIRED) {
      const current = await this.dataSource
        .getRepository(ApplicationDocument)
        .findOne({ where: { applicationId, documentType, isCurrent: true } });
      if (current !== null && current.status !== DocumentStatus.REJECTED) {
        throw new DomainException(
          ApiErrorCode.APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED,
          HttpStatus.CONFLICT,
          'Only rejected documents can be replaced while correction is required',
        );
      }
    }
  }
  private isDocumentUniqueConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const databaseError = candidate.driverError ?? candidate;
    return (
      databaseError.code === '23505' &&
      (databaseError.constraint === DOCUMENT_VERSION_UNIQUE_INDEX ||
        databaseError.constraint === CURRENT_DOCUMENT_UNIQUE_INDEX)
    );
  }
  private applicationNotFound() {
    return new DomainException(
      ApiErrorCode.APPLICATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Renewal application not found',
    );
  }
  private documentNotFound() {
    return new DomainException(
      ApiErrorCode.APPLICATION_DOCUMENT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Application document not found',
    );
  }
  private notOwned() {
    return new DomainException(
      ApiErrorCode.RESOURCE_NOT_OWNED,
      HttpStatus.FORBIDDEN,
      'Renewal application is outside the citizen ownership scope',
    );
  }
  private invalidFile() {
    return new DomainException(
      ApiErrorCode.DOCUMENT_FILE_INVALID,
      HttpStatus.BAD_REQUEST,
      'Document file is invalid',
    );
  }
}
