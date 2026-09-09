import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { FilesService } from '../files/files.service';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Payment } from './entities/payment.entity';
import { PaymentStatusHistory } from './entities/payment-status-history.entity';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentPdfService } from './payment-pdf.service';
import { generateReceiptNumber, PaymentsService } from './payments.service';

const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';

describe('PaymentsService transitions', () => {
  it('generates a six-digit receipt number with leading zeroes', () => {
    expect(generateReceiptNumber('2026-08-12', () => 7)).toBe(
      'RCP-20260812-000007',
    );
    expect(generateReceiptNumber('2026-08-12', () => 918204)).toMatch(
      /^RCP-\d{8}-\d{6}$/,
    );
  });

  it('confirms a pending payment under a lock with snapshot-funded PDFs, artifacts, and one history row', async () => {
    const fixture = createFixture();

    const result = await fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID, {
      paymentReference: ' counter-123 ',
    });

    expect(fixture.paymentRepository.findOne).toHaveBeenCalledWith({
      where: { id: PAYMENT_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(fixture.categoryRepository.findOne).not.toHaveBeenCalled();
    expect(fixture.paymentPdf.generateReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '5000.00',
        baseAmount: '30000.00',
        lateDays: 10,
        lateFee: '5000.00',
        totalAmount: '35000.00',
        paymentReference: 'counter-123',
        receiptNumber: expect.stringMatching(/^RCP-20260812-\d{6}$/) as unknown,
      }),
    );
    expect(fixture.paymentPdf.generateInspectionSheet).toHaveBeenCalledTimes(1);
    expect(fixture.files.savePaymentArtifact).toHaveBeenNthCalledWith(
      1,
      'application-id',
      'receipt',
      Buffer.from('%PDF-receipt'),
    );
    expect(fixture.files.savePaymentArtifact).toHaveBeenNthCalledWith(
      2,
      'application-id',
      'inspection-sheet',
      Buffer.from('%PDF-inspection-sheet'),
    );
    expect(fixture.historyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: PaymentStatus.PENDING,
        toStatus: PaymentStatus.CONFIRMED,
        changedByUserId: ACTOR_ID,
        reason: null,
      }),
    );
    expect(result).toMatchObject({
      status: PaymentStatus.CONFIRMED,
      confirmedByUserId: ACTOR_ID,
    });
    expect(fixture.application).toMatchObject({
      status: ApplicationStatus.APPROVED,
      readyForInspectionAt: new Date('2026-08-12T00:00:00.000Z'),
    });
    expect(fixture.applicationRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'application-id' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(fixture.applicationHistoryRepository.create).toHaveBeenCalledWith({
      applicationId: 'application-id',
      previousStatus: ApplicationStatus.SUBMITTED,
      newStatus: ApplicationStatus.APPROVED,
      changedByUserId: ACTOR_ID,
      reason: 'PAYMENT_CONFIRMED',
    });
    expect(fixture.applicationHistoryRepository.save).toHaveBeenCalledTimes(1);
    expect(fixture.payment.confirmedAt).toBe(
      fixture.application.readyForInspectionAt,
    );
    expect(fixture.payment.providerName).toBeNull();
    expect(fixture.payment.providerTransactionId).toBeNull();
  });

  it('confirms a rejected payment without erasing rejection metadata', async () => {
    const fixture = createFixture(payment(PaymentStatus.REJECTED));
    const rejectedAt = fixture.payment.rejectedAt;
    const rejectedByUserId = fixture.payment.rejectedByUserId;
    const rejectionReason = fixture.payment.rejectionReason;

    await fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID);

    expect(fixture.payment).toMatchObject({
      status: PaymentStatus.CONFIRMED,
      rejectedAt,
      rejectedByUserId,
      rejectionReason,
    });
    expect(fixture.historyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: PaymentStatus.REJECTED,
        toStatus: PaymentStatus.CONFIRMED,
        reason: null,
      }),
    );
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
  });

  it('rejects confirmation for a draft application', async () => {
    const fixture = createFixture(payment(), {
      status: ApplicationStatus.DRAFT,
      submittedAt: null,
    });

    await expect(
      fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.payment.status).toBe(PaymentStatus.PENDING);
    expect(fixture.paymentPdf.generateReceipt).not.toHaveBeenCalled();
    expect(fixture.applicationHistoryRepository.save).not.toHaveBeenCalled();
  });

  it('canonically expires at the Day-31 boundary before payment confirmation', async () => {
    const fixture = createFixture(payment(), {
      submittedAt: new Date('2026-07-13T00:00:00.000Z'),
    });

    await expect(
      fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
    expect(fixture.application.readyForInspectionAt).toBeNull();
    expect(fixture.payment.status).toBe(PaymentStatus.PENDING);
    expect(fixture.applicationHistoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: ApplicationStatus.SUBMITTED,
        newStatus: ApplicationStatus.EXPIRED,
        changedByUserId: null,
        reason: 'INITIAL_INSPECTION_PERIOD_EXPIRED',
      }),
    );
    expect(fixture.paymentPdf.generateReceipt).not.toHaveBeenCalled();
  });

  it('keeps double confirmation idempotent at the application boundary', async () => {
    const fixture = createFixture();
    await fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID);
    const confirmedAt = fixture.payment.confirmedAt;

    await expect(
      fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.payment.confirmedAt).toBe(confirmedAt);
    expect(fixture.applicationRepository.save).toHaveBeenCalledTimes(1);
    expect(fixture.applicationHistoryRepository.save).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent confirmation so readiness and history are written once', async () => {
    const fixture = createFixture();
    serializeTransactions(fixture);

    const results = await Promise.allSettled([
      fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
      fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
    expect(fixture.applicationRepository.save).toHaveBeenCalledTimes(1);
    expect(fixture.applicationHistoryRepository.save).toHaveBeenCalledTimes(1);
  });

  it.each([PaymentStatus.CONFIRMED, PaymentStatus.FAILED])(
    'rejects confirmation from %s after acquiring the lock',
    async (status) => {
      const fixture = createFixture(payment(status));

      await expect(
        fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
      ).rejects.toMatchObject({
        code: ApiErrorCode.PAYMENT_INVALID_TRANSITION,
        status: HttpStatus.CONFLICT,
      });
      expect(fixture.paymentPdf.generateReceipt).not.toHaveBeenCalled();
    },
  );

  it('rejects a pending payment with a trimmed reason and one history row', async () => {
    const fixture = createFixture();

    await fixture.service.rejectPayment(PAYMENT_ID, ACTOR_ID, '  no cash  ');

    expect(fixture.payment).toMatchObject({
      status: PaymentStatus.REJECTED,
      rejectedByUserId: ACTOR_ID,
      rejectionReason: 'no cash',
    });
    expect(fixture.historyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: PaymentStatus.PENDING,
        toStatus: PaymentStatus.REJECTED,
        reason: 'no cash',
      }),
    );
    expect(fixture.application.status).toBe(ApplicationStatus.SUBMITTED);
    expect(fixture.applicationRepository.save).not.toHaveBeenCalled();
    expect(fixture.paymentPdf.generateReceipt).not.toHaveBeenCalled();
  });

  it('requires a nonblank rejection/reopen reason', async () => {
    const fixture = createFixture();
    await expect(
      fixture.service.rejectPayment(PAYMENT_ID, ACTOR_ID, '   '),
    ).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_REJECTION_REASON_REQUIRED,
    });

    const rejectedFixture = createFixture(payment(PaymentStatus.REJECTED));
    await expect(
      rejectedFixture.service.reopenPayment(PAYMENT_ID, ACTOR_ID, '   '),
    ).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_REJECTION_REASON_REQUIRED,
    });
  });

  it('reopens a rejected payment but retains rejection summary metadata', async () => {
    const fixture = createFixture(payment(PaymentStatus.REJECTED));
    const rejectedAt = fixture.payment.rejectedAt;
    await fixture.service.reopenPayment(PAYMENT_ID, ACTOR_ID, '  corrected  ');

    expect(fixture.payment).toMatchObject({
      status: PaymentStatus.PENDING,
      rejectedAt,
      rejectedByUserId: 'prior-admin',
      rejectionReason: 'prior rejection',
    });
    expect(fixture.historyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: PaymentStatus.REJECTED,
        toStatus: PaymentStatus.PENDING,
        reason: 'corrected',
      }),
    );
  });

  it('cleans a receipt if inspection-sheet storage fails', async () => {
    const fixture = createFixture();
    fixture.files.savePaymentArtifact
      .mockResolvedValueOnce({ storageKey: 'receipt-key' })
      .mockRejectedValueOnce(new Error('inspection storage failed'));

    await expect(
      fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
    ).rejects.toThrow('inspection storage failed');
    expect(fixture.files.deleteIfExists).toHaveBeenCalledWith('receipt-key');
    expect(fixture.paymentRepository.save).not.toHaveBeenCalled();
  });

  it('cleans both artifacts and preserves the history-write error', async () => {
    const fixture = createFixture();
    const failure = new Error('history write failed');
    fixture.historyRepository.save.mockRejectedValue(failure);

    await expect(
      fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
    ).rejects.toBe(failure);
    expect(fixture.files.deleteIfExists).toHaveBeenCalledWith('receipt-key');
    expect(fixture.files.deleteIfExists).toHaveBeenCalledWith(
      'inspection-sheet-key',
    );
  });

  it.each([
    [PaymentStatus.PENDING, 'reopenPayment'],
    [PaymentStatus.CONFIRMED, 'rejectPayment'],
    [PaymentStatus.CONFIRMED, 'reopenPayment'],
    [PaymentStatus.FAILED, 'rejectPayment'],
  ] as const)(
    'rejects illegal %s -> %s transitions',
    async (status, method) => {
      const fixture = createFixture(payment(status));

      const transition =
        method === 'rejectPayment'
          ? fixture.service.rejectPayment(PAYMENT_ID, ACTOR_ID, 'reason')
          : fixture.service.reopenPayment(PAYMENT_ID, ACTOR_ID, 'reason');

      await expect(transition).rejects.toMatchObject({
        code: ApiErrorCode.PAYMENT_INVALID_TRANSITION,
        status: HttpStatus.CONFLICT,
      });
    },
  );

  it('cleans both artifacts and retries after a receipt number collision', async () => {
    const fixture = createFixture();
    fixture.paymentRepository.findOne.mockImplementation(() =>
      Promise.resolve(payment()),
    );
    fixture.paymentRepository.save
      .mockRejectedValueOnce({ code: '23505' })
      .mockResolvedValueOnce(fixture.payment);

    await fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID);

    expect(fixture.files.deleteIfExists).toHaveBeenCalledTimes(2);
    expect(fixture.paymentPdf.generateReceipt).toHaveBeenCalledTimes(2);
  });

  it('returns the receipt-number conflict after retry exhaustion', async () => {
    const fixture = createFixture();
    fixture.paymentRepository.findOne.mockImplementation(() =>
      Promise.resolve(payment()),
    );
    fixture.paymentRepository.save.mockRejectedValue({ code: '23505' });

    await expect(
      fixture.service.confirmPayment(PAYMENT_ID, ACTOR_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.PAYMENT_RECEIPT_NUMBER_CONFLICT,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.files.deleteIfExists).toHaveBeenCalledTimes(6);
  });
});

function createFixture(
  initialPayment = payment(),
  applicationOverrides: Partial<RenewalApplication> = {},
) {
  const paymentRepository = {
    findOne: jest.fn().mockResolvedValue(initialPayment),
    save: jest.fn(<T>(value: T): Promise<T> => Promise.resolve(value)),
  };
  const application = {
    id: 'application-id',
    vehicleId: 'vehicle-id',
    referenceNumber: 'VIR-20260812-ABCDEF123456',
    status: ApplicationStatus.SUBMITTED,
    submittedAt: new Date('2026-08-01T00:00:00.000Z'),
    readyForInspectionAt: null,
    ...applicationOverrides,
  } as RenewalApplication;
  const applicationRepository = {
    findOne: jest.fn().mockResolvedValue(application),
    save: jest.fn(<T>(value: T): Promise<T> => Promise.resolve(value)),
  };
  const vehicleRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'vehicle-id',
      plateNumber: '2A-3146',
      make: 'Toyota',
      model: 'RAV4',
      vehicleClass: 'LIGHT',
      inspectionExpiryDate: '2026-08-01',
    }),
  };
  const historyRepository = {
    create: jest.fn(<T>(value: T): T => value),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const applicationHistoryRepository = {
    create: jest.fn(<T>(value: T): T => value),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const categoryRepository = { findOne: jest.fn() };
  const manager = {
    getRepository: jest.fn((target: unknown) => {
      if (target === Payment) return paymentRepository;
      if (target === RenewalApplication) return applicationRepository;
      if (target === Vehicle) return vehicleRepository;
      if (target === PaymentStatusHistory) return historyRepository;
      if (target === RenewalApplicationStatusHistory)
        return applicationHistoryRepository;
      return categoryRepository;
    }),
    query: jest.fn().mockResolvedValue([
      {
        confirmedAt: new Date('2026-08-12T00:00:00.000Z'),
        confirmationDate: '2026-08-12',
      },
    ]),
  };
  const dataSource = {
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager),
    ),
  };
  const files = {
    savePaymentArtifact: jest.fn((_applicationId: string, kind: string) =>
      Promise.resolve({
        storageKey: kind === 'receipt' ? 'receipt-key' : 'inspection-sheet-key',
      }),
    ),
    deleteIfExists: jest.fn().mockResolvedValue(undefined),
  };
  const paymentPdf = {
    generateReceipt: jest.fn().mockResolvedValue(Buffer.from('%PDF-receipt')),
    generateInspectionSheet: jest
      .fn()
      .mockResolvedValue(Buffer.from('%PDF-inspection-sheet')),
  };

  return {
    service: new PaymentsService(
      dataSource as unknown as DataSource,
      {} as Repository<Payment>,
      {} as Repository<PaymentStatusHistory>,
      {} as Repository<RenewalApplication>,
      files as unknown as FilesService,
      paymentPdf as unknown as PaymentPdfService,
      {} as never,
    ),
    payment: initialPayment,
    application,
    paymentRepository,
    applicationRepository,
    vehicleRepository,
    historyRepository,
    applicationHistoryRepository,
    categoryRepository,
    files,
    paymentPdf,
    dataSource,
    manager,
  };
}

function serializeTransactions(fixture: ReturnType<typeof createFixture>) {
  let previous = Promise.resolve();
  fixture.dataSource.transaction.mockImplementation(
    (callback: (transactionManager: typeof fixture.manager) => unknown) => {
      const current = previous.then(() => callback(fixture.manager));
      previous = current.then(
        () => undefined,
        () => undefined,
      );
      return current;
    },
  );
}

function payment(status = PaymentStatus.PENDING): Payment {
  return {
    id: PAYMENT_ID,
    applicationId: 'application-id',
    invoiceNumber: 'INV-20260812-000007',
    receiptNumber: null,
    method: PaymentMethod.PAY_AT_STATION,
    status,
    inspectionFeeKhr: '25000.00',
    serviceFeeKhr: '5000.00',
    baseAmount: '30000.00',
    previousInspectionExpiryDate: '2026-08-01',
    lateDays: 10,
    lateFee: '5000.00',
    totalAmount: '35000.00',
    currency: 'KHR',
    paymentReference: null,
    providerName: null,
    providerTransactionId: null,
    confirmedByUserId: null,
    confirmedAt: null,
    rejectedByUserId: status === PaymentStatus.REJECTED ? 'prior-admin' : null,
    rejectedAt:
      status === PaymentStatus.REJECTED ? new Date('2026-08-01') : null,
    rejectionReason:
      status === PaymentStatus.REJECTED ? 'prior rejection' : null,
    invoiceFileKey: 'invoice-key',
    receiptFileKey: null,
    inspectionSheetFileKey: null,
    invoiceIssuedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  } as Payment;
}
