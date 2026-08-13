import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { mapAdminPayment, mapPayment } from './payment-response.mapper';

describe('payment response mapper', () => {
  it('preserves decimal strings and hides payment storage keys', () => {
    const mapped = mapPayment(payment());

    expect(mapped).toMatchObject({
      baseAmount: '30000.00',
      lateFee: '500.00',
      totalAmount: '30500.00',
      invoiceAvailable: true,
      receiptAvailable: false,
      inspectionSheetAvailable: false,
    });
    expect(mapped).not.toHaveProperty('invoiceFileKey');
    expect(mapped).not.toHaveProperty('receiptFileKey');
    expect(mapped).not.toHaveProperty('inspectionSheetFileKey');
  });

  it.each([PaymentStatus.PENDING, PaymentStatus.REJECTED])(
    'does not expose confirmation artifacts for %s payments',
    (status) => {
      expect(mapPayment(payment({ status }))).toMatchObject({
        invoiceAvailable: true,
        receiptAvailable: false,
        inspectionSheetAvailable: false,
      });
    },
  );

  it('exposes confirmation artifacts only for confirmed payments', () => {
    expect(
      mapPayment(payment({ status: PaymentStatus.CONFIRMED })),
    ).toMatchObject({
      invoiceAvailable: true,
      receiptAvailable: true,
      inspectionSheetAvailable: true,
    });
  });

  it('adds only actor IDs to the admin response', () => {
    const mapped = mapAdminPayment(payment());

    expect(mapped).toMatchObject({
      confirmedByUserId: 'confirmed-by-id',
      rejectedByUserId: 'rejected-by-id',
    });
    expect(mapped).not.toHaveProperty('confirmedByUser');
    expect(mapped).not.toHaveProperty('rejectedByUser');
  });
});

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-id',
    applicationId: 'application-id',
    invoiceNumber: 'INV-20260812-123456',
    receiptNumber: 'RCP-20260812-123456',
    method: PaymentMethod.PAY_AT_STATION,
    status: PaymentStatus.PENDING,
    baseAmount: '30000.00',
    previousInspectionExpiryDate: '2026-08-01',
    lateDays: 10,
    lateFee: '500.00',
    totalAmount: '30500.00',
    currency: 'KHR',
    paymentReference: 'cash desk',
    providerName: null,
    providerTransactionId: null,
    confirmedByUserId: 'confirmed-by-id',
    confirmedAt: null,
    failedAt: null,
    failureReason: null,
    rejectedAt: null,
    rejectedByUserId: 'rejected-by-id',
    rejectionReason: null,
    invoiceIssuedAt: new Date('2026-08-12T00:00:00.000Z'),
    invoiceFileKey: 'payments/payment-id/invoice.pdf',
    receiptFileKey: 'payments/payment-id/receipt.pdf',
    inspectionSheetFileKey: 'payments/payment-id/inspection-sheet.pdf',
    createdAt: new Date('2026-08-12T00:00:00.000Z'),
    updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    application: {} as never,
    confirmedByUser: null,
    rejectedByUser: null,
    statusHistory: [],
    ...overrides,
  };
}
