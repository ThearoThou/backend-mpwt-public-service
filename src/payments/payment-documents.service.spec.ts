import { HttpStatus } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { FilesService } from '../files/files.service';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentDocumentsService } from './payment-documents.service';

describe('PaymentDocumentsService', () => {
  it('checks citizen ownership before reading an invoice', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue({
      id: 'application-id',
      citizenId: 'other-citizen',
    });

    await expect(
      fixture.service.getCitizenInvoiceDocument('citizen-id', 'application-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });
    expect(fixture.files.read).not.toHaveBeenCalled();
  });

  it.each([
    PaymentStatus.PENDING,
    PaymentStatus.REJECTED,
    PaymentStatus.CONFIRMED,
  ])('allows an invoice for %s', async (status) => {
    const fixture = createFixture(payment(status));
    await expect(
      fixture.service.getAdminInvoiceDocument('payment-id'),
    ).resolves.toMatchObject({ filename: 'INV-20260812-000007.pdf' });
    expect(fixture.files.read).toHaveBeenCalledWith('invoice-key');
  });

  it('blocks receipt and inspection sheet before confirmation', async () => {
    const fixture = createFixture(payment(PaymentStatus.PENDING));
    await expect(
      fixture.service.getAdminReceiptDocument('payment-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_DOCUMENT_NOT_AVAILABLE,
    });
    await expect(
      fixture.service.getAdminInspectionSheetDocument('payment-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_DOCUMENT_NOT_AVAILABLE,
    });
    expect(fixture.files.read).not.toHaveBeenCalled();
  });

  it('reads confirmed receipt and inspection sheet with safe filenames', async () => {
    const fixture = createFixture(payment(PaymentStatus.CONFIRMED));
    await expect(
      fixture.service.getAdminReceiptDocument('payment-id'),
    ).resolves.toMatchObject({
      filename: 'RCP-20260812-000008.pdf',
      mimeType: 'application/pdf',
    });
    await expect(
      fixture.service.getAdminInspectionSheetDocument('payment-id'),
    ).resolves.toMatchObject({
      filename: 'RCP-20260812-000008-inspection-sheet.pdf',
    });
    expect(fixture.files.read).toHaveBeenCalledWith('receipt-key');
    expect(fixture.files.read).toHaveBeenCalledWith('inspection-sheet-key');
  });

  it('maps a missing physical artifact to the safe document availability error', async () => {
    const fixture = createFixture(payment(PaymentStatus.CONFIRMED));
    fixture.files.read.mockRejectedValue({
      code: 'ENOENT',
      path: 'C:\\private\\secret.pdf',
    });

    await expect(
      fixture.service.getAdminReceiptDocument('payment-id'),
    ).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_DOCUMENT_NOT_AVAILABLE,
      status: HttpStatus.NOT_FOUND,
    });
  });
});

function createFixture(initialPayment = payment()) {
  const paymentRepository = {
    findOne: jest.fn().mockResolvedValue(initialPayment),
  };
  const applicationRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'application-id',
      citizenId: 'citizen-id',
    }),
  };
  const files = { read: jest.fn().mockResolvedValue(Buffer.from('%PDF-unit')) };
  return {
    service: new PaymentDocumentsService(
      paymentRepository as unknown as Repository<Payment>,
      applicationRepository as unknown as Repository<RenewalApplication>,
      files as unknown as FilesService,
    ),
    paymentRepository,
    applicationRepository,
    files,
  };
}

function payment(status = PaymentStatus.PENDING): Payment {
  return {
    id: 'payment-id',
    applicationId: 'application-id',
    invoiceNumber: 'INV-20260812-000007',
    receiptNumber: 'RCP-20260812-000008',
    status,
    invoiceFileKey: 'invoice-key',
    receiptFileKey: 'receipt-key',
    inspectionSheetFileKey: 'inspection-sheet-key',
  } as Payment;
}
