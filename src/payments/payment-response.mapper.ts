import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentMethod } from './enums/payment-method.enum';

export interface PaymentResponse {
  id: string;
  applicationId: string;
  invoiceNumber: string;
  receiptNumber: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  inspectionFeeKhr: string;
  serviceFeeKhr: string;
  baseAmount: string;
  previousInspectionExpiryDate: string;
  lateDays: number;
  lateFee: string;
  totalAmount: string;
  currency: string;
  paymentReference: string | null;
  invoiceIssuedAt: Date;
  confirmedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  invoiceAvailable: boolean;
  receiptAvailable: boolean;
  inspectionSheetAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminPaymentResponse extends PaymentResponse {
  confirmedByUserId: string | null;
  rejectedByUserId: string | null;
}

export function mapPayment(payment: Payment): PaymentResponse {
  return {
    id: payment.id,
    applicationId: payment.applicationId,
    invoiceNumber: payment.invoiceNumber,
    receiptNumber: payment.receiptNumber,
    method: payment.method,
    status: payment.status,
    inspectionFeeKhr: payment.inspectionFeeKhr,
    serviceFeeKhr: payment.serviceFeeKhr,
    baseAmount: payment.baseAmount,
    previousInspectionExpiryDate: payment.previousInspectionExpiryDate,
    lateDays: payment.lateDays,
    lateFee: payment.lateFee,
    totalAmount: payment.totalAmount,
    currency: payment.currency,
    paymentReference: payment.paymentReference,
    invoiceIssuedAt: payment.invoiceIssuedAt,
    confirmedAt: payment.confirmedAt,
    rejectedAt: payment.rejectedAt,
    rejectionReason: payment.rejectionReason,
    invoiceAvailable: payment.invoiceFileKey !== null,
    receiptAvailable:
      payment.status === PaymentStatus.CONFIRMED &&
      payment.receiptFileKey !== null,
    inspectionSheetAvailable:
      payment.status === PaymentStatus.CONFIRMED &&
      payment.inspectionSheetFileKey !== null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export function mapAdminPayment(payment: Payment): AdminPaymentResponse {
  return {
    ...mapPayment(payment),
    confirmedByUserId: payment.confirmedByUserId,
    rejectedByUserId: payment.rejectedByUserId,
  };
}
