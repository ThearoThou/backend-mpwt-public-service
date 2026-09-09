import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, type Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { FilesService } from '../files/files.service';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import type { BasePaginationQueryDto } from '../common/pagination/base-pagination-query.dto';
import {
  mapAdminApplicationDocument,
  type AdminApplicationDocumentResponse,
} from './admin-application-document-response.mapper';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { DocumentType } from './enums/document-type.enum';
import {
  ApplicationDocumentsService,
  type UploadedApplicationFile,
} from './application-documents.service';

@Injectable()
export class AdminApplicationDocumentsService {
  constructor(
    @InjectRepository(RenewalApplication)
    private readonly applications: Repository<RenewalApplication>,
    @InjectRepository(ApplicationDocument)
    private readonly documents: Repository<ApplicationDocument>,
    private readonly filesService: FilesService,
    private readonly applicationDocumentsService: ApplicationDocumentsService,
  ) {}

  async upload(
    adminId: string,
    applicationId: string,
    documentType: DocumentType,
    file: UploadedApplicationFile | undefined,
  ): Promise<AdminApplicationDocumentResponse> {
    return mapAdminApplicationDocument(
      await this.applicationDocumentsService.uploadAsAdmin(
        adminId,
        applicationId,
        documentType,
        file,
      ),
    );
  }

  async listCurrent(
    applicationId: string,
  ): Promise<AdminApplicationDocumentResponse[]> {
    await this.assertSubmittedApplication(applicationId);
    const documents = await this.documents.find({
      where: { applicationId, isCurrent: true },
      order: { documentType: 'ASC' },
    });
    return documents.map(mapAdminApplicationDocument);
  }

  async listHistory(
    applicationId: string,
    documentType: DocumentType,
    input: BasePaginationQueryDto,
  ): Promise<AdminApplicationDocumentHistoryListResult> {
    await this.assertSubmittedApplication(applicationId);
    const [documents, total] = await this.documents.findAndCount({
      where: { applicationId, documentType },
      order: { versionNumber: 'DESC', uploadedAt: 'DESC', id: 'DESC' },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });
    return {
      data: documents.map(mapAdminApplicationDocument),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async download(applicationId: string, documentId: string) {
    await this.assertSubmittedApplication(applicationId);
    const document = await this.documents.findOne({
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

  private async assertSubmittedApplication(
    applicationId: string,
  ): Promise<void> {
    const application = await this.applications.findOne({
      where: { id: applicationId, submittedAt: Not(IsNull()) },
    });
    if (application === null) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }
  }

  private documentNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.APPLICATION_DOCUMENT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Application document not found',
    );
  }
}

interface AdminApplicationDocumentHistoryListResult {
  data: AdminApplicationDocumentResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}
