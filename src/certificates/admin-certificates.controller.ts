import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CertificateIssuanceService } from './certificate-issuance.service';
import {
  CertificateReadsService,
  type CertificatePdfDownload,
} from './certificate-reads.service';
import { CertificateNumberDto } from './dto/certificate-number.dto';

@Controller('admin/applications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCertificatesController {
  constructor(
    private readonly issuance: CertificateIssuanceService,
    private readonly reads: CertificateReadsService,
  ) {}

  @Post(':applicationId/certificate/issue')
  async issue(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CertificateNumberDto,
  ) {
    return createDataResponse(
      await this.issuance.issue(applicationId, actor.userId, input),
    );
  }

  @Get(':applicationId/certificate')
  async status(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(
      await this.reads.getAdminCertificate(applicationId),
    );
  }

  @Get(':applicationId/certificate/download')
  async download(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.stream(
      await this.reads.downloadAdminCertificate(applicationId),
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
