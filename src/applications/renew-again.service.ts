import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { FilesService } from '../files/files.service';
import { type RenewalApplicationResponse } from './application-response.mapper';
import { ApplicationWorkflowService } from './application-workflow.service';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';

const REQUIRED_DOCUMENT_TYPES = Object.values(DocumentType);
const UNFINISHED_APPLICATION_UNIQUE_INDEX =
  'uq_unfinished_application_per_vehicle';

interface CopiedDocument {
  sourceDocumentId: string;
  documentType: DocumentType;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: string;
  storageKey: string;
}

@Injectable()
export class RenewAgainService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly files: FilesService,
    private readonly workflow: ApplicationWorkflowService,
  ) {}

  async renewAgain(
    citizenId: string,
    expiredApplicationId: string,
  ): Promise<RenewalApplicationResponse> {
    const sourceDocuments = await this.loadSourceDocuments(
      citizenId,
      expiredApplicationId,
    );
    const applicationId = randomUUID();
    const copiedDocuments: CopiedDocument[] = [];

    try {
      for (const source of sourceDocuments) {
        const content = await this.files.read(source.storageKey);
        const stored = await this.files.saveApplicationDocument(
          applicationId,
          content,
          this.extensionFor(source),
        );
        copiedDocuments.push({
          sourceDocumentId: source.id,
          documentType: source.documentType,
          originalFileName: source.originalFileName,
          mimeType: source.mimeType,
          fileSizeBytes: source.fileSizeBytes,
          storageKey: stored.storageKey,
        });
      }

      return await this.dataSource.transaction((manager) =>
        this.createRenewedDraftWithManager(
          manager,
          citizenId,
          expiredApplicationId,
          applicationId,
          copiedDocuments,
        ),
      );
    } catch (error) {
      await this.deleteCopiedFiles(copiedDocuments);
      if (this.isUnfinishedApplicationUniqueConflict(error)) {
        throw this.unfinishedApplicationExists();
      }
      throw error;
    }
  }

  private async loadSourceDocuments(
    citizenId: string,
    applicationId: string,
  ): Promise<ApplicationDocument[]> {
    const source = await this.dataSource
      .getRepository(RenewalApplication)
      .findOne({ where: { id: applicationId } });
    this.assertRenewableSource(source, citizenId);

    const documents = await this.dataSource
      .getRepository(ApplicationDocument)
      .find({ where: { applicationId, isCurrent: true } });
    this.assertRequiredDocuments(documents);
    return documents.filter((document) =>
      REQUIRED_DOCUMENT_TYPES.includes(document.documentType),
    );
  }

  private async createRenewedDraftWithManager(
    manager: EntityManager,
    citizenId: string,
    expiredApplicationId: string,
    applicationId: string,
    copiedDocuments: CopiedDocument[],
  ): Promise<RenewalApplicationResponse> {
    const source = await manager.getRepository(RenewalApplication).findOne({
      where: { id: expiredApplicationId },
      lock: { mode: 'pessimistic_write' },
    });
    this.assertRenewableSource(source, citizenId);

    const draft = await this.workflow.createDraftWithManager(
      manager,
      citizenId,
      source.vehicleId,
      applicationId,
    );
    const documents = manager.getRepository(ApplicationDocument);
    await documents.save(
      copiedDocuments.map((document) =>
        documents.create({
          applicationId: draft.id,
          documentType: document.documentType,
          versionNumber: 1,
          isCurrent: true,
          replacesDocumentId: null,
          uploadedByUserId: citizenId,
          storageKey: document.storageKey,
          originalFileName: document.originalFileName,
          mimeType: document.mimeType,
          fileSizeBytes: document.fileSizeBytes,
          status: DocumentStatus.PENDING,
          reviewedByUserId: null,
          reviewedAt: null,
          rejectionReason: null,
        }),
      ),
    );
    return draft;
  }

  private assertRenewableSource(
    source: RenewalApplication | null,
    citizenId: string,
  ): asserts source is RenewalApplication {
    if (source === null) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }
    if (source.citizenId !== citizenId) {
      throw new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Renewal application is outside the citizen ownership scope',
      );
    }
    if (source.status !== ApplicationStatus.EXPIRED) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Only an expired application can be renewed again',
      );
    }
  }

  private assertRequiredDocuments(documents: ApplicationDocument[]): void {
    if (
      REQUIRED_DOCUMENT_TYPES.some(
        (type) => !documents.some((document) => document.documentType === type),
      )
    ) {
      throw new DomainException(
        ApiErrorCode.REQUIRED_DOCUMENTS_MISSING,
        HttpStatus.CONFLICT,
        'Required documents are missing',
      );
    }
  }

  private extensionFor(document: ApplicationDocument): string {
    const extensionByMimeType: Record<string, readonly string[]> = {
      'application/pdf': ['pdf'],
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
    };
    const allowedExtensions = extensionByMimeType[document.mimeType];
    if (allowedExtensions === undefined) {
      throw new DomainException(
        ApiErrorCode.DOCUMENT_FILE_INVALID,
        HttpStatus.CONFLICT,
        'Stored document metadata is invalid',
      );
    }
    const match = /\.([A-Za-z0-9]+)$/u.exec(document.originalFileName);
    const extension = match?.[1]?.toLowerCase();
    if (extension !== undefined && allowedExtensions.includes(extension)) {
      return extension;
    }

    throw new DomainException(
      ApiErrorCode.DOCUMENT_FILE_INVALID,
      HttpStatus.CONFLICT,
      'Stored document metadata is invalid',
    );
  }

  private async deleteCopiedFiles(documents: CopiedDocument[]): Promise<void> {
    await Promise.allSettled(
      documents.map((document) =>
        this.files.deleteIfExists(document.storageKey),
      ),
    );
  }

  private isUnfinishedApplicationUniqueConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as {
      code?: unknown;
      constraint?: unknown;
      driverError?: { code?: unknown; constraint?: unknown };
    };
    const databaseError = candidate.driverError ?? candidate;
    return (
      databaseError.code === '23505' &&
      databaseError.constraint === UNFINISHED_APPLICATION_UNIQUE_INDEX
    );
  }

  private unfinishedApplicationExists(): DomainException {
    return new DomainException(
      ApiErrorCode.UNFINISHED_APPLICATION_ALREADY_EXISTS,
      HttpStatus.CONFLICT,
      'An unfinished renewal application already exists for this vehicle',
    );
  }
}
