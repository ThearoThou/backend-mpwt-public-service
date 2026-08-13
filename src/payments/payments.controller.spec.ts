import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { PaymentDocumentsService } from './payment-documents.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  it('wraps the ownership-safe citizen payment response', async () => {
    const fixture = createFixture();
    fixture.payments.getCitizenPayment.mockResolvedValue({ id: 'payment-id' });

    await expect(
      fixture.controller.getPayment(actor(), 'application-id'),
    ).resolves.toEqual({ data: { id: 'payment-id' } });
    expect(fixture.payments.getCitizenPayment).toHaveBeenCalledWith(
      'citizen-id',
      'application-id',
    );
  });

  it('streams citizen PDFs with safe headers and no storage key metadata', async () => {
    const fixture = createFixture();
    const response = { setHeader: jest.fn() };
    fixture.documents.getCitizenInspectionSheetDocument.mockResolvedValue({
      content: Buffer.from('%PDF-unit'),
      filename: 'RCP-20260812-000008-inspection-sheet.pdf',
      mimeType: 'application/pdf',
    });

    const file = await fixture.controller.downloadInspectionSheet(
      actor(),
      'application-id',
      response as never,
    );

    expect(file).toBeDefined();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="RCP-20260812-000008-inspection-sheet.pdf"',
    );
    expect(
      fixture.documents.getCitizenInspectionSheetDocument,
    ).toHaveBeenCalledWith('citizen-id', 'application-id');
  });

  it('uses the dedicated citizen invoice and receipt document methods', async () => {
    const fixture = createFixture();
    const response = { setHeader: jest.fn() };
    fixture.documents.getCitizenInvoiceDocument.mockResolvedValue(
      document('INV-20260812-000007.pdf'),
    );
    fixture.documents.getCitizenReceiptDocument.mockResolvedValue(
      document('RCP-20260812-000008.pdf'),
    );

    await fixture.controller.downloadInvoice(
      actor(),
      'application-id',
      response as never,
    );
    await fixture.controller.downloadReceipt(
      actor(),
      'application-id',
      response as never,
    );

    expect(fixture.documents.getCitizenInvoiceDocument).toHaveBeenCalledWith(
      'citizen-id',
      'application-id',
    );
    expect(fixture.documents.getCitizenReceiptDocument).toHaveBeenCalledWith(
      'citizen-id',
      'application-id',
    );
  });

  it('declares citizen access-token and role guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PaymentsController)).toEqual([
      AccessTokenGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, PaymentsController)).toEqual([
      UserRole.CITIZEN,
    ]);
  });
});

function createFixture() {
  const payments = { getCitizenPayment: jest.fn() };
  const documents = {
    getCitizenInvoiceDocument: jest.fn(),
    getCitizenReceiptDocument: jest.fn(),
    getCitizenInspectionSheetDocument: jest.fn(),
  };
  return {
    controller: new PaymentsController(
      payments as unknown as PaymentsService,
      documents as unknown as PaymentDocumentsService,
    ),
    payments,
    documents,
  };
}

function document(filename: string) {
  return {
    content: Buffer.from('%PDF-unit'),
    filename,
    mimeType: 'application/pdf' as const,
  };
}

function actor() {
  return {
    userId: 'citizen-id',
    role: UserRole.CITIZEN,
    sessionId: 'session-id',
  };
}
