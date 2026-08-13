import { PaymentStatus } from './enums/payment-status.enum';
import { mapPaymentStatusHistory } from './payment-status-history-response.mapper';

describe('payment status history response mapper', () => {
  it('maps only the safe history fields', () => {
    const mapped = mapPaymentStatusHistory({
      id: 'history-id',
      paymentId: 'payment-id',
      fromStatus: PaymentStatus.PENDING,
      toStatus: PaymentStatus.REJECTED,
      changedByUserId: 'admin-id',
      reason: 'Receipt is unreadable',
      createdAt: new Date('2026-08-12T00:00:00.000Z'),
      payment: {} as never,
      changedByUser: null,
    });

    expect(mapped).toEqual({
      id: 'history-id',
      fromStatus: PaymentStatus.PENDING,
      toStatus: PaymentStatus.REJECTED,
      changedByUserId: 'admin-id',
      reason: 'Receipt is unreadable',
      createdAt: new Date('2026-08-12T00:00:00.000Z'),
    });
    expect(mapped).not.toHaveProperty('paymentId');
  });
});
