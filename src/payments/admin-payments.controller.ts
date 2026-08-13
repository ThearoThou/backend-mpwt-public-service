import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import {
  createDataResponse,
  createPaginatedResponse,
} from '../common/http/api-response';
import { UserRole } from '../users/enums/user-role.enum';
import {
  ConfirmPaymentDto,
  PaymentTransitionReasonDto,
} from './dto/payment-transition.dtos';
import type { PaymentPdfDocument } from './payment-documents.service';
import { PaymentDocumentsService } from './payment-documents.service';
import { ListAdminPaymentsQueryDto } from './dto/payment-request.dtos';
import { mapAdminPayment } from './payment-response.mapper';
import { PaymentsService } from './payments.service';

@Controller('admin/payments')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly documents: PaymentDocumentsService,
  ) {}

  @Get()
  async list(@Query() input: ListAdminPaymentsQueryDto) {
    const result = await this.payments.listAdminPayments(input);
    return createPaginatedResponse(result.data, result.meta);
  }

  @Post('applications/:applicationId/initialize')
  async initialize(
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return createDataResponse(
      mapAdminPayment(await this.payments.initializePayment(applicationId)),
    );
  }

  @Get(':paymentId/history')
  async history(
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
  ) {
    return createDataResponse(
      await this.payments.getPaymentStatusHistory(paymentId),
    );
  }

  @Post(':paymentId/confirm')
  async confirm(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
    @Body() input: ConfirmPaymentDto,
  ) {
    return createDataResponse(
      await this.payments.confirmPayment(paymentId, actor.userId, input),
    );
  }

  @Post(':paymentId/reject')
  async reject(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
    @Body() input: PaymentTransitionReasonDto,
  ) {
    return createDataResponse(
      await this.payments.rejectPayment(paymentId, actor.userId, input.reason),
    );
  }

  @Post(':paymentId/reopen')
  async reopen(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
    @Body() input: PaymentTransitionReasonDto,
  ) {
    return createDataResponse(
      await this.payments.reopenPayment(paymentId, actor.userId, input.reason),
    );
  }

  @Get(':paymentId/invoice')
  async downloadInvoice(
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.streamDocument(
      await this.documents.getAdminInvoiceDocument(paymentId),
      response,
    );
  }

  @Get(':paymentId/receipt')
  async downloadReceipt(
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.streamDocument(
      await this.documents.getAdminReceiptDocument(paymentId),
      response,
    );
  }

  @Get(':paymentId/inspection-sheet')
  async downloadInspectionSheet(
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.streamDocument(
      await this.documents.getAdminInspectionSheetDocument(paymentId),
      response,
    );
  }

  @Get(':paymentId')
  async detail(
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
  ) {
    return createDataResponse(await this.payments.getAdminPayment(paymentId));
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
