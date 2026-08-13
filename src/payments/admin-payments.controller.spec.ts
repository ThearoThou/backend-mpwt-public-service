import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentDocumentsService } from './payment-documents.service';
import { PaymentsService } from './payments.service';

describe('AdminPaymentsController', () => {
  it('wraps the locked paginated list and forwards its query', async () => {
    const fixture = createFixture();
    const query = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt' as const,
      sortOrder: 'asc' as const,
    };
    fixture.payments.listAdminPayments.mockResolvedValue({
      data: [{ id: 'payment-id' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    await expect(fixture.controller.list(query)).resolves.toEqual({
      data: [{ id: 'payment-id' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    expect(fixture.payments.listAdminPayments).toHaveBeenCalledWith(query);
  });

  it('passes actor and optional payment reference to confirmation', async () => {
    const fixture = createFixture();
    fixture.payments.confirmPayment.mockResolvedValue({ id: 'payment-id' });

    await expect(
      fixture.controller.confirm(actor(), 'payment-id', {
        paymentReference: 'counter-123',
      }),
    ).resolves.toEqual({ data: { id: 'payment-id' } });
    expect(fixture.payments.confirmPayment).toHaveBeenCalledWith(
      'payment-id',
      'admin-id',
      { paymentReference: 'counter-123' },
    );
  });

  it('forwards trimmed DTO reasons to reject and reopen services', async () => {
    const fixture = createFixture();
    fixture.payments.rejectPayment.mockResolvedValue({ id: 'payment-id' });
    fixture.payments.reopenPayment.mockResolvedValue({ id: 'payment-id' });
    await fixture.controller.reject(actor(), 'payment-id', {
      reason: 'reason',
    });
    await fixture.controller.reopen(actor(), 'payment-id', {
      reason: 'reason',
    });
    expect(fixture.payments.rejectPayment).toHaveBeenCalledWith(
      'payment-id',
      'admin-id',
      'reason',
    );
    expect(fixture.payments.reopenPayment).toHaveBeenCalledWith(
      'payment-id',
      'admin-id',
      'reason',
    );
  });

  it('retries initialization through the idempotent initializer and wraps the mapped result', async () => {
    const fixture = createFixture();
    fixture.payments.initializePayment.mockResolvedValue(payment());

    const result = await fixture.controller.initialize('application-id');

    expect(fixture.payments.initializePayment).toHaveBeenCalledWith(
      'application-id',
    );
    expect(result.data).toMatchObject({ id: 'payment-id' });
    expect(result.data).not.toHaveProperty('invoiceFileKey');
  });

  it('streams admin receipt PDFs with the locked filename', async () => {
    const fixture = createFixture();
    const response = { setHeader: jest.fn() };
    fixture.documents.getAdminReceiptDocument.mockResolvedValue({
      content: Buffer.from('%PDF-unit'),
      filename: 'RCP-20260812-000008.pdf',
      mimeType: 'application/pdf',
    });

    await fixture.controller.downloadReceipt('payment-id', response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="RCP-20260812-000008.pdf"',
    );
  });

  it('wraps detail and chronological history responses', async () => {
    const fixture = createFixture();
    fixture.payments.getAdminPayment.mockResolvedValue({ id: 'payment-id' });
    fixture.payments.getPaymentStatusHistory.mockResolvedValue([
      { id: 'history-id' },
    ]);

    await expect(fixture.controller.detail('payment-id')).resolves.toEqual({
      data: { id: 'payment-id' },
    });
    await expect(fixture.controller.history('payment-id')).resolves.toEqual({
      data: [{ id: 'history-id' }],
    });
  });

  it('declares admin access-token and role guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminPaymentsController),
    ).toEqual([AccessTokenGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, AdminPaymentsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });
});

function createFixture() {
  const payments = {
    listAdminPayments: jest.fn(),
    confirmPayment: jest.fn(),
    rejectPayment: jest.fn(),
    reopenPayment: jest.fn(),
    initializePayment: jest.fn(),
    getAdminPayment: jest.fn(),
    getPaymentStatusHistory: jest.fn(),
  };
  const documents = { getAdminReceiptDocument: jest.fn() };
  return {
    controller: new AdminPaymentsController(
      payments as unknown as PaymentsService,
      documents as unknown as PaymentDocumentsService,
    ),
    payments,
    documents,
  };
}

function actor() {
  return { userId: 'admin-id', role: UserRole.ADMIN, sessionId: 'session-id' };
}

function payment() {
  return {
    id: 'payment-id',
    applicationId: 'application-id',
    invoiceNumber: 'INV-20260812-000007',
    receiptNumber: null,
    method: 'PAY_AT_STATION',
    status: 'PENDING',
    baseAmount: '30000.00',
    previousInspectionExpiryDate: '2026-08-01',
    lateDays: 10,
    lateFee: '5000.00',
    totalAmount: '35000.00',
    currency: 'KHR',
    paymentReference: null,
    invoiceIssuedAt: new Date(),
    confirmedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    invoiceFileKey: 'invoice-key',
    receiptFileKey: null,
    inspectionSheetFileKey: null,
    confirmedByUserId: null,
    rejectedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
