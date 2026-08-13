import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentStatusHistory } from './entities/payment-status-history.entity';

export interface PaymentStatusHistoryResponse {
  id: string;
  fromStatus: PaymentStatus;
  toStatus: PaymentStatus;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: Date;
}

export function mapPaymentStatusHistory(
  history: PaymentStatusHistory,
): PaymentStatusHistoryResponse {
  return {
    id: history.id,
    fromStatus: history.fromStatus,
    toStatus: history.toStatus,
    changedByUserId: history.changedByUserId,
    reason: history.reason,
    createdAt: history.createdAt,
  };
}
