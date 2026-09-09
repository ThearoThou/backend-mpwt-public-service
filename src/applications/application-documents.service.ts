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
import { expireInitialApplicationIfDue } from './initial-application-expiry';

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
    return mapApplicationDocument(
      await this.uploadForActor({
        actorUserId: citizenId,
        ownerCitizenId: citizenId,
        applicationId,
        documentType,
        file,
        allowDraft: true,
      }),
    );
  }

  async uploadAsAdmin(
    adminId: string,
    applicationId: string,
    documentType: DocumentType,
    file: UploadedApplicationFile | undefined,
  ): Promise<ApplicationDocument> {
    return this.uploadForActor({
      actorUserId: adminId,
      ownerCitizenId: null,
      applicationId,
      documentType,
      file,
      allowDraft: false,
    });
  }

  private async uploadForActor(input: DocumentUploadActorInput) {
    const { applicationId, file } = input;
    const extension = this.validateFile(file);
    await this.assertUploadPreflight(input);
    const stored = await this.filesService.saveApplicationDocument(
      applicationId,
      file!.buffer,
      extension,
    );
    try {
      const document = await this.dataSource.transaction((manager) =>
        this.uploadWithManager(manager, input, file!, stored.storageKey),
      );
      if (document === null) throw this.applicationExpired();
      return document;
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

  async delete(
    citizenId: string,
    applicationId: string,
    documentId: string,
  ): Promise<void> {
    const storageKey = await this.dataSource.transaction((manager) =>
      this.deleteWithManager(manager, citizenId, applicationId, documentId),
    );
    await this.filesService.deleteIfExists(storageKey);
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
    input: DocumentUploadActorInput,
    file: UploadedApplicationFile,
    storageKey: string,
  ): Promise<ApplicationDocument | null> {
    const {
      actorUserId,
      ownerCitizenId,
      applicationId,
      documentType,
      allowDraft,
    } = input;
    const applications = manager.getRepository(RenewalApplication);
    const application = await applications.findOne({
      where: { id: applicationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (application === null) throw this.applicationNotFound();
    if (ownerCitizenId !== null && application.citizenId !== ownerCitizenId) {
      throw this.notOwned();
    }
    if (
      application.status === ApplicationStatus.CORRECTION_REQUIRED &&
      (await expireInitialApplicationIfDue(manager, application, new Date()))
    ) {
      return null;
    }
    if (
      application.status !== ApplicationStatus.CORRECTION_REQUIRED &&
      (!allowDraft || application.status !== ApplicationStatus.DRAFT)
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
    const latest = await documents.findOne({
      where: { applicationId, documentType },
      order: { versionNumber: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      application.status === ApplicationStatus.CORRECTION_REQUIRED &&
      current?.status !== DocumentStatus.REJECTED
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
        versionNumber: latest === null ? 1 : latest.versionNumber + 1,
        isCurrent: true,
        replacesDocumentId: current?.id ?? null,
        uploadedByUserId: actorUserId,
        storageKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: String(file.size),
        status: DocumentStatus.PENDING,
        reviewedByUserId: null,
        reviewedAt: null,
        rejectionReason: null,
      }),
    );
    return document;
  }

  private async deleteWithManager(
    manager: EntityManager,
    citizenId: string,
    applicationId: string,
    documentId: string,
  ): Promise<string> {
    const applications = manager.getRepository(RenewalApplication);
    const application = await applications.findOne({
      where: { id: applicationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (application === null) throw this.applicationNotFound();
    if (application.citizenId !== citizenId) throw this.notOwned();
    if (application.status !== ApplicationStatus.DRAFT) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_DOCUMENT_DELETE_NOT_ALLOWED,
        HttpStatus.CONFLICT,
        'Document deletion is only allowed while the application is a draft',
      );
    }

    const documents = manager.getRepository(ApplicationDocument);
    const document = await documents.findOne({
      where: { id: documentId, applicationId, isCurrent: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (document === null) throw this.documentNotFound();

    await documents.remove(document);
    return document.storageKey;
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
    input: DocumentUploadActorInput,
  ): Promise<void> {
    const { ownerCitizenId, applicationId, documentType, allowDraft } = input;
    const application = await this.dataSource
      .getRepository(RenewalApplication)
      .findOne({ where: { id: applicationId } });
    if (application === null) throw this.applicationNotFound();
    if (ownerCitizenId !== null && application.citizenId !== ownerCitizenId) {
      throw this.notOwned();
    }
    if (
      application.status !== ApplicationStatus.CORRECTION_REQUIRED &&
      (!allowDraft || application.status !== ApplicationStatus.DRAFT)
    ) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED,
        HttpStatus.CONFLICT,
        'Document upload is not allowed for the current application status',
      );
    }
    if (application.status === ApplicationStatus.CORRECTION_REQUIRED) {
      const result = await this.dataSource.transaction(async (manager) => {
        const locked = await manager.getRepository(RenewalApplication).findOne({
          where: { id: applicationId },
          lock: { mode: 'pessimistic_write' },
        });
        if (locked === null) throw this.applicationNotFound();
        if (ownerCitizenId !== null && locked.citizenId !== ownerCitizenId) {
          throw this.notOwned();
        }
        if (locked.status !== ApplicationStatus.CORRECTION_REQUIRED) {
          throw new DomainException(
            ApiErrorCode.APPLICATION_DOCUMENT_UPLOAD_NOT_ALLOWED,
            HttpStatus.CONFLICT,
            'Document upload is not allowed for the current application status',
          );
        }
        if (await expireInitialApplicationIfDue(manager, locked, new Date())) {
          return 'EXPIRED' as const;
        }
        const current = await manager
          .getRepository(ApplicationDocument)
          .findOne({
            where: { applicationId, documentType, isCurrent: true },
          });
        return current?.status === DocumentStatus.REJECTED
          ? ('ALLOWED' as const)
          : ('NOT_REJECTED' as const);
      });
      if (result === 'EXPIRED') throw this.applicationExpired();
      if (result === 'NOT_REJECTED') {
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
  private applicationExpired() {
    return new DomainException(
      ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'The application has expired',
    );
  }
}

interface DocumentUploadActorInput {
  actorUserId: string;
  ownerCitizenId: string | null;
  applicationId: string;
  documentType: DocumentType;
  file: UploadedApplicationFile | undefined;
  allowDraft: boolean;
}
