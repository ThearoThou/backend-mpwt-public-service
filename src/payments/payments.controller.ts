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
import type { PaymentPdfDocument } from './payment-documents.service';
import { PaymentDocumentsService } from './payment-documents.service';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.CITIZEN)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly documents: PaymentDocumentsService,
  ) {}

  @Get('applications/:applicationId')
  async getPayment(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(
      await this.payments.getCitizenPayment(actor.userId, applicationId),
    );
  }

  @Get('applications/:applicationId/invoice')
  async downloadInvoice(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.streamDocument(
      await this.documents.getCitizenInvoiceDocument(
        actor.userId,
        applicationId,
      ),
      response,
    );
  }

  @Get('applications/:applicationId/receipt')
  async downloadReceipt(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.streamDocument(
      await this.documents.getCitizenReceiptDocument(
        actor.userId,
        applicationId,
      ),
      response,
    );
  }

  @Get('applications/:applicationId/inspection-sheet')
  async downloadInspectionSheet(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.streamDocument(
      await this.documents.getCitizenInspectionSheetDocument(
        actor.userId,
        applicationId,
      ),
      response,
    );
  }

  private streamDocument(
    document: PaymentPdfDocument,
    response: Response,
  ): StreamableFile {
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.filename.replace(/["\\\r\n]/g, '_')}"`,
    );
    return new StreamableFile(document.content);
  }
}
