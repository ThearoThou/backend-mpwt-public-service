import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import {
  createDataResponse,
  createPaginatedResponse,
} from '../common/http/api-response';
import { BasePaginationQueryDto } from '../common/pagination/base-pagination-query.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminApplicationDocumentsService } from './admin-application-documents.service';
import { DocumentType } from './enums/document-type.enum';

@Controller('admin/applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminApplicationDocumentsController {
  constructor(
    private readonly adminApplicationDocumentsService: AdminApplicationDocumentsService,
  ) {}

  @Get(':applicationId/documents')
  async listCurrent(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(
      await this.adminApplicationDocumentsService.listCurrent(applicationId),
    );
  }

  @Get(':applicationId/documents/:documentType/history')
  async listHistory(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Param('documentType', new ParseEnumPipe(DocumentType))
    documentType: DocumentType,
    @Query() input: BasePaginationQueryDto,
  ) {
    const result = await this.adminApplicationDocumentsService.listHistory(
      applicationId,
      documentType,
      input,
    );
    return createPaginatedResponse(result.data, result.meta);
  }

  @Get(':applicationId/documents/:documentId/download')
  async download(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, content } =
      await this.adminApplicationDocumentsService.download(
        applicationId,
        documentId,
      );
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.originalFileName.replace(/["\\\r\n]/g, '_')}"`,
    );
    return new StreamableFile(content);
  }
}
