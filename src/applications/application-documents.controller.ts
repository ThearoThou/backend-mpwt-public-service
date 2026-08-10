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
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import {
  createDataResponse,
  createPaginatedResponse,
} from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import {
  ApplicationDocumentsService,
  type UploadedApplicationFile,
} from './application-documents.service';
import { DocumentType } from './enums/document-type.enum';
import { BasePaginationQueryDto } from '../common/pagination/base-pagination-query.dto';

@Controller('applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class ApplicationDocumentsController {
  constructor(private readonly documentsService: ApplicationDocumentsService) {}

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
      await this.documentsService.upload(
        actor.userId,
        applicationId,
        documentType,
        file,
      ),
    );
  }

  @Get(':applicationId/documents')
  async listCurrent(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(
      await this.documentsService.listCurrent(actor.userId, applicationId),
    );
  }

  @Get(':applicationId/documents/:documentType/history')
  async history(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Param('documentType', new ParseEnumPipe(DocumentType))
    documentType: DocumentType,
    @Query() input: BasePaginationQueryDto,
  ) {
    const result = await this.documentsService.listHistory(
      actor.userId,
      applicationId,
      documentType,
      input,
    );
    return createPaginatedResponse(result.data, result.meta);
  }

  @Get(':applicationId/documents/:documentId/download')
  async download(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, content } = await this.documentsService.download(
      actor.userId,
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
