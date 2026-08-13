import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { FilesService } from '../files/files.service';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';

export interface PaymentPdfDocument {
  content: Buffer;
  filename: string;
  mimeType: 'application/pdf';
}

type PaymentDocumentKind = 'invoice' | 'receipt' | 'inspection-sheet';

@Injectable()
export class PaymentDocumentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(RenewalApplication)
    private readonly applications: Repository<RenewalApplication>,
    private readonly files: FilesService,
  ) {}

  async getCitizenInvoiceDocument(
    citizenId: string,
    applicationId: string,
  ): Promise<PaymentPdfDocument> {
    return this.getCitizenDocument(citizenId, applicationId, 'invoice');
  }

  async getCitizenReceiptDocument(
    citizenId: string,
    applicationId: string,
  ): Promise<PaymentPdfDocument> {
    return this.getCitizenDocument(citizenId, applicationId, 'receipt');
  }

  async getCitizenInspectionSheetDocument(
    citizenId: string,
    applicationId: string,
  ): Promise<PaymentPdfDocument> {
    return this.getCitizenDocument(
      citizenId,
      applicationId,
      'inspection-sheet',
    );
  }

  async getAdminInvoiceDocument(
    paymentId: string,
  ): Promise<PaymentPdfDocument> {
    return this.getAdminDocument(paymentId, 'invoice');
  }

  async getAdminReceiptDocument(
    paymentId: string,
  ): Promise<PaymentPdfDocument> {
    return this.getAdminDocument(paymentId, 'receipt');
  }

  async getAdminInspectionSheetDocument(
    paymentId: string,
  ): Promise<PaymentPdfDocument> {
    return this.getAdminDocument(paymentId, 'inspection-sheet');
  }

  private async getCitizenDocument(
    citizenId: string,
    applicationId: string,
    kind: PaymentDocumentKind,
  ): Promise<PaymentPdfDocument> {
    const application = await this.applications.findOne({
      where: { id: applicationId },
    });
    if (application === null) throw this.applicationNotFound();
    if (application.citizenId !== citizenId) throw this.notOwned();

    const payment = await this.payments.findOne({ where: { applicationId } });
    if (payment === null) throw this.paymentNotFound();
    return this.readAvailableDocument(payment, kind);
  }

  private async getAdminDocument(
    paymentId: string,
    kind: PaymentDocumentKind,
  ): Promise<PaymentPdfDocument> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (payment === null) throw this.paymentNotFound();
    return this.readAvailableDocument(payment, kind);
  }

  private async readAvailableDocument(
    payment: Payment,
    kind: PaymentDocumentKind,
  ): Promise<PaymentPdfDocument> {
    const artifact = this.documentArtifact(payment, kind);
    if (artifact === null) throw this.documentNotAvailable();

    try {
      return {
        content: await this.files.read(artifact.storageKey),
        filename: artifact.filename,
        mimeType: 'application/pdf',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw this.documentNotAvailable();
      }
      throw new DomainException(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Payment document could not be read',
      );
    }
  }

  private documentArtifact(
    payment: Payment,
    kind: PaymentDocumentKind,
  ): { storageKey: string; filename: string } | null {
    if (kind === 'invoice' && payment.invoiceFileKey !== null) {
      return {
        storageKey: payment.invoiceFileKey,
        filename: `${payment.invoiceNumber}.pdf`,
      };
    }
    if (
      kind === 'receipt' &&
      payment.status === PaymentStatus.CONFIRMED &&
      payment.receiptFileKey !== null &&
      payment.receiptNumber !== null
    ) {
      return {
        storageKey: payment.receiptFileKey,
        filename: `${payment.receiptNumber}.pdf`,
      };
    }
    if (
      kind === 'inspection-sheet' &&
      payment.status === PaymentStatus.CONFIRMED &&
      payment.inspectionSheetFileKey !== null &&
      payment.receiptNumber !== null
    ) {
      return {
        storageKey: payment.inspectionSheetFileKey,
        filename: `${payment.receiptNumber}-inspection-sheet.pdf`,
      };
    }
    return null;
  }

  private applicationNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.APPLICATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Renewal application not found',
    );
  }

  private paymentNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.PAYMENT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Payment not found',
    );
  }

  private notOwned(): DomainException {
    return new DomainException(
      ApiErrorCode.RESOURCE_NOT_OWNED,
      HttpStatus.FORBIDDEN,
      'Renewal application is outside the citizen ownership scope',
    );
  }

  private documentNotAvailable(): DomainException {
    return new DomainException(
      ApiErrorCode.PAYMENT_DOCUMENT_NOT_AVAILABLE,
      HttpStatus.NOT_FOUND,
      'Payment document is not available',
    );
  }
}
