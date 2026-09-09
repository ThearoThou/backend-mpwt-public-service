import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { AdminApplicationDocumentsService } from './admin-application-documents.service';
import type { UploadedApplicationFile } from './application-documents.service';
import { DocumentType } from './enums/document-type.enum';

@Controller('admin/applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminApplicationDocumentsController {
  constructor(
    private readonly adminApplicationDocumentsService: AdminApplicationDocumentsService,
  ) {}

  @Post(':applicationId/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5242880 } }))
  async upload(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Body('documentType', new ParseEnumPipe(DocumentType))
    documentType: DocumentType,
    @UploadedFile() file: UploadedApplicationFile | undefined,
  ) {
    return createDataResponse(
      await this.adminApplicationDocumentsService.upload(
        actor.userId,
        applicationId,
        documentType,
        file,
      ),
    );
  }

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
