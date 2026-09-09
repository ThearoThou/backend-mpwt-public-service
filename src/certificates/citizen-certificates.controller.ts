import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import type { AuthenticatedActor } from '../common/auth/authenticated-actor';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { createDataResponse } from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CertificateReadsService,
  type CertificatePdfDownload,
} from './certificate-reads.service';

@Controller('applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class CitizenCertificatesController {
  constructor(private readonly reads: CertificateReadsService) {}

  @Get(':applicationId/certificate')
  async status(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(
      await this.reads.getCitizenCertificate(actor.userId, applicationId),
    );
  }

  @Get(':applicationId/certificate/download')
  async download(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.stream(
      await this.reads.downloadCitizenCertificate(actor.userId, applicationId),
      response,
    );
  }

  private stream(
    document: CertificatePdfDownload,
    response: Response,
  ): StreamableFile {
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.filename}"`,
    );
    return new StreamableFile(document.content);
  }
}
