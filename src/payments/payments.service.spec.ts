import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { FilesService } from '../files/files.service';
import { Payment } from './entities/payment.entity';
import { PaymentStatusHistory } from './entities/payment-status-history.entity';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentPdfService } from './payment-pdf.service';
import { PaymentsService } from './payments.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const APPLICATION_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';

describe('PaymentsService read foundation', () => {
  it('returns payment detail only after confirming citizen application ownership', async () => {
    const fixture = createFixture();
    fixture.applications.findOne.mockResolvedValue(application(CITIZEN_ID));
    fixture.payments.findOne.mockResolvedValue(payment());

    await expect(
      fixture.service.getCitizenPayment(CITIZEN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({ id: PAYMENT_ID, applicationId: APPLICATION_ID });
    expect(fixture.applications.findOne).toHaveBeenCalledWith({
      where: { id: APPLICATION_ID },
    });
    expect(fixture.payments.findOne).toHaveBeenCalledWith({
      where: { applicationId: APPLICATION_ID },
    });
  });

  it('rejects a different citizen before looking up the payment', async () => {
    const fixture = createFixture();
    fixture.applications.findOne.mockResolvedValue(
      application(OTHER_CITIZEN_ID),
    );

    await expect(
      fixture.service.getCitizenPayment(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });
    expect(fixture.payments.findOne).not.toHaveBeenCalled();
  });

  it('distinguishes a missing application from a missing payment', async () => {
    const fixture = createFixture();
    fixture.applications.findOne.mockResolvedValue(null);

    await expect(
      fixture.service.getCitizenPayment(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });

    fixture.applications.findOne.mockResolvedValue(application(CITIZEN_ID));
    fixture.payments.findOne.mockResolvedValue(null);
    await expect(
      fixture.service.getCitizenPayment(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('filters, searches, safely sorts, and paginates the admin list', async () => {
    const fixture = createFixture();
    fixture.paymentQuery.getManyAndCount.mockResolvedValue([[payment()], 1]);

    const result = await fixture.service.listAdminPayments({
      page: 2,
      limit: 10,
      sortOrder: 'asc',
      status: PaymentStatus.PENDING,
      method: PaymentMethod.PAY_AT_STATION,
      search: 'INV-20260812',
      sortBy: 'totalAmount',
    });

    expect(fixture.paymentQuery.innerJoin).toHaveBeenNthCalledWith(
      1,
      'payment.application',
      'application',
    );
    expect(fixture.paymentQuery.innerJoin).toHaveBeenNthCalledWith(
      2,
      'application.vehicle',
      'vehicle',
    );
    expect(fixture.paymentQuery.andWhere).toHaveBeenCalledWith(
      'payment.status = :status',
      { status: PaymentStatus.PENDING },
    );
    expect(fixture.paymentQuery.andWhere).toHaveBeenCalledWith(
      'payment.method = :method',
      { method: PaymentMethod.PAY_AT_STATION },
    );
    expect(fixture.paymentQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('payment.invoiceNumber ILIKE :search'),
      { search: '%INV-20260812%' },
    );
    expect(fixture.paymentQuery.orderBy).toHaveBeenCalledWith(
      'payment.totalAmount',
      'ASC',
    );
    expect(fixture.paymentQuery.skip).toHaveBeenCalledWith(10);
    expect(fixture.paymentQuery.take).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('maps history in chronological order without raw entities', async () => {
    const fixture = createFixture();
    fixture.payments.findOne.mockResolvedValue(payment());
    fixture.statusHistory.find.mockResolvedValue([
      history('history-1', PaymentStatus.PENDING, PaymentStatus.REJECTED),
      history('history-2', PaymentStatus.REJECTED, PaymentStatus.CONFIRMED),
    ]);

    await expect(
      fixture.service.getPaymentStatusHistory(PAYMENT_ID),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'history-1' }),
      expect.objectContaining({ id: 'history-2' }),
    ]);
    expect(fixture.statusHistory.find).toHaveBeenCalledWith({
      where: { paymentId: PAYMENT_ID },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  });
});

function createFixture() {
  const paymentQuery = query();
  const payments = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(paymentQuery),
  };
  const statusHistory = { find: jest.fn() };
  const applications = { findOne: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const files = { deleteIfExists: jest.fn() };
  const paymentPdf = { generateInvoice: jest.fn() };

  return {
    service: new PaymentsService(
      dataSource as unknown as DataSource,
      payments as unknown as Repository<Payment>,
      statusHistory as unknown as Repository<PaymentStatusHistory>,
      applications as unknown as Repository<RenewalApplication>,
      files as unknown as FilesService,
      paymentPdf as unknown as PaymentPdfService,
    ),
    payments,
    statusHistory,
    applications,
    paymentQuery,
  };
}

function query() {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
}

function application(citizenId: string): RenewalApplication {
  return {
    id: APPLICATION_ID,
    citizenId,
    vehicleId: 'vehicle-id',
    referenceNumber: 'VIR-20260812-ABCDEF123456',
    status: ApplicationStatus.APPROVED,
    applicantSnapshot: null,
    vehicleSnapshot: null,
    currentCorrectionReason: null,
    currentRejectionReason: null,
    preferredInspectionStationId: null,
    preferredInspectionDate: null,
    submittedAt: new Date(),
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    citizen: {} as never,
    vehicle: {} as never,
    cancelledByUser: null,
    preferredInspectionStation: null,
    documents: [],
    statusHistory: [],
    appointments: [],
    payment: null,
    inspections: [],
    sticker: null,
    notifications: [],
    timelineEvents: [],
    auditLogs: [],
  };
}

function payment(): Payment {
  return {
    id: PAYMENT_ID,
    applicationId: APPLICATION_ID,
    invoiceNumber: 'INV-20260812-123456',
    receiptNumber: null,
    method: PaymentMethod.PAY_AT_STATION,
    status: PaymentStatus.PENDING,
    inspectionFeeKhr: '25000.00',
    serviceFeeKhr: '5000.00',
    baseAmount: '30000.00',
    previousInspectionExpiryDate: '2026-08-01',
    lateDays: 10,
    lateFee: '500.00',
    totalAmount: '30500.00',
    currency: 'KHR',
    paymentReference: null,
    providerName: null,
    providerTransactionId: null,
    confirmedByUserId: null,
    confirmedAt: null,
    failedAt: null,
    failureReason: null,
    rejectedAt: null,
    rejectedByUserId: null,
    rejectionReason: null,
    invoiceIssuedAt: new Date(),
    invoiceFileKey: 'payments/payment-id/invoice.pdf',
    receiptFileKey: null,
    inspectionSheetFileKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    application: {} as never,
    confirmedByUser: null,
    rejectedByUser: null,
    statusHistory: [],
  };
}

function history(
  id: string,
  fromStatus: PaymentStatus,
  toStatus: PaymentStatus,
): PaymentStatusHistory {
  return {
    id,
    paymentId: PAYMENT_ID,
    fromStatus,
    toStatus,
    changedByUserId: 'admin-id',
    reason: null,
    createdAt: new Date(),
    payment: {} as never,
    changedByUser: null,
  };
}
