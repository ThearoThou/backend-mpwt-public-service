import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { FilesService } from '../files/files.service';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Payment } from './entities/payment.entity';
import { PaymentStatusHistory } from './entities/payment-status-history.entity';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentPdfService } from './payment-pdf.service';
import { generateInvoiceNumber, PaymentsService } from './payments.service';

const APPLICATION_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '22222222-2222-4222-8222-222222222222';

describe('PaymentsService payment initialization', () => {
  it('generates Cambodia-local invoice dates with six numeric digits, including leading zeroes', () => {
    expect(generateInvoiceNumber('2026-08-12', () => 4821)).toBe(
      'INV-20260812-004821',
    );
    expect(generateInvoiceNumber('2026-08-12', () => 7)).toMatch(
      /^INV-\d{8}-\d{6}$/,
    );
  });

  it('locks, snapshots authoritative values, stores one invoice, and creates a pending payment', async () => {
    const fixture = createFixture();

    const result = await fixture.service.initializePayment(APPLICATION_ID);

    expect(fixture.applicationRepository.findOne).toHaveBeenCalledWith({
      where: { id: APPLICATION_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(fixture.appointmentRepository.find).toHaveBeenCalledWith({
      where: {
        applicationId: APPLICATION_ID,
        status: AppointmentStatus.SCHEDULED,
      },
    });
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('Asia/Phnom_Penh'),
      ['2026-08-01', '25000.00', '5000.00'],
    );
    expect(fixture.paymentPdf.generateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationReferenceNumber: 'VIR-20260812-ABCDEF123456',
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '5000.00',
        baseAmount: '30000.00',
        lateDays: 10,
        lateFee: '5000.00',
        totalAmount: '35000.00',
        currency: 'KHR',
        invoiceNumber: expect.stringMatching(/^INV-20260812-\d{6}$/) as unknown,
      }),
    );
    expect(fixture.files.savePaymentArtifact).toHaveBeenCalledWith(
      APPLICATION_ID,
      'invoice',
      Buffer.from('%PDF-unit'),
    );
    expect(fixture.paymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APPLICATION_ID,
        receiptNumber: null,
        method: PaymentMethod.PAY_AT_STATION,
        status: PaymentStatus.PENDING,
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '5000.00',
        baseAmount: '30000.00',
        lateDays: 10,
        lateFee: '5000.00',
        totalAmount: '35000.00',
        currency: 'KHR',
        invoiceFileKey: 'payment-artifacts/application-id/invoice/invoice.pdf',
        receiptFileKey: null,
        inspectionSheetFileKey: null,
      }),
    );
    expect(result).toMatchObject({
      id: PAYMENT_ID,
      applicationId: APPLICATION_ID,
    });
  });

  it('returns an existing payment before validating or generating an invoice', async () => {
    const fixture = createFixture();
    const existing = payment();
    fixture.paymentRepository.findOne.mockResolvedValue(existing);

    await expect(
      fixture.service.initializePayment(APPLICATION_ID),
    ).resolves.toBe(existing);
    expect(fixture.appointmentRepository.find).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.paymentPdf.generateInvoice).not.toHaveBeenCalled();
    expect(fixture.files.savePaymentArtifact).not.toHaveBeenCalled();
  });

  it('rejects an ineligible application without generating or storing an invoice', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.SUBMITTED),
    );

    await expect(
      fixture.service.initializePayment(APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.paymentPdf.generateInvoice).not.toHaveBeenCalled();
    expect(fixture.files.savePaymentArtifact).not.toHaveBeenCalled();
    expect(fixture.paymentRepository.save).not.toHaveBeenCalled();
  });

  it('rejects missing scheduled appointments without changing appointment state', async () => {
    const fixture = createFixture();
    fixture.appointmentRepository.find.mockResolvedValue([]);

    await expect(
      fixture.service.initializePayment(APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPOINTMENT_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.vehicleRepository.findOne).not.toHaveBeenCalled();
    expect(fixture.paymentPdf.generateInvoice).not.toHaveBeenCalled();
  });

  it('rejects invalid live category fees before calculating or creating an invoice', async () => {
    const fixture = createFixture();
    fixture.categoryRepository.findOne.mockResolvedValue({
      ...category(),
      serviceFeeKhr: '-1.00',
    });

    await expect(
      fixture.service.initializePayment(APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.paymentPdf.generateInvoice).not.toHaveBeenCalled();
    expect(fixture.files.savePaymentArtifact).not.toHaveBeenCalled();
  });

  it('calculates a citizen-owned draft fee estimate without creating payment or scheduling records', async () => {
    const fixture = createFixture();
    const draft = application(ApplicationStatus.DRAFT, CITIZEN_ID);
    fixture.applicationRepository.findOne.mockResolvedValue(draft);

    await expect(
      fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID),
    ).resolves.toEqual({
      inspectionFeeKhr: '25000.00',
      serviceFeeKhr: '5000.00',
      baseAmount: '30000.00',
      lateDays: 10,
      lateFee: '5000.00',
      totalAmount: '35000.00',
      currency: 'KHR',
    });
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('Asia/Phnom_Penh'),
      ['2026-08-01', '25000.00', '5000.00'],
    );
    expect(fixture.paymentRepository.create).not.toHaveBeenCalled();
    expect(fixture.paymentRepository.save).not.toHaveBeenCalled();
    expect(fixture.appointmentRepository.find).not.toHaveBeenCalled();
    expect(fixture.files.savePaymentArtifact).not.toHaveBeenCalled();
    expect(draft.status).toBe(ApplicationStatus.DRAFT);
  });

  it('returns a zero late fee when the shared calculator reports no late days', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.DRAFT, CITIZEN_ID),
    );
    fixture.query.mockResolvedValue([
      {
        invoiceIssuedAt: new Date('2026-08-12T00:00:00.000Z'),
        paymentDate: '2026-08-12',
        lateDays: 0,
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '5000.00',
        baseAmount: '30000.00',
        lateFee: '0.00',
        totalAmount: '30000.00',
      },
    ]);

    await expect(
      fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({
      lateDays: 0,
      lateFee: '0.00',
      totalAmount: '30000.00',
    });
  });

  it('rejects fee estimates for another citizen before loading vehicle data', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.DRAFT, OTHER_CITIZEN_ID),
    );

    await expect(
      fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });
    expect(fixture.vehicleRepository.findOne).not.toHaveBeenCalled();
    expect(fixture.paymentRepository.create).not.toHaveBeenCalled();
  });

  it('allows estimates only while the owned application is a draft', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.SUBMITTED, CITIZEN_ID),
    );

    await expect(
      fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.vehicleRepository.findOne).not.toHaveBeenCalled();
  });

  it('uses the existing business error when a draft vehicle has no inspection category', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.DRAFT, CITIZEN_ID),
    );
    fixture.vehicleRepository.findOne.mockResolvedValue(
      vehicle({ inspectionCategoryId: null }),
    );

    await expect(
      fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.categoryRepository.findOne).not.toHaveBeenCalled();
    expect(fixture.paymentRepository.create).not.toHaveBeenCalled();
  });

  it('deletes a stored invoice when payment persistence fails', async () => {
    const fixture = createFixture();
    const failure = new Error('database write failed');
    fixture.paymentRepository.save.mockRejectedValue(failure);

    await expect(
      fixture.service.initializePayment(APPLICATION_ID),
    ).rejects.toBe(failure);
    expect(fixture.files.deleteIfExists).toHaveBeenCalledWith(
      'payment-artifacts/application-id/invoice/invoice.pdf',
    );
  });

  it('cleans up a losing invoice and returns the winner after an application uniqueness race', async () => {
    const fixture = createFixture();
    const existing = payment();
    fixture.paymentRepository.save.mockRejectedValue({ code: '23505' });
    fixture.directPayments.findOne.mockResolvedValue(existing);

    await expect(
      fixture.service.initializePayment(APPLICATION_ID),
    ).resolves.toBe(existing);
    expect(fixture.files.deleteIfExists).toHaveBeenCalledWith(
      'payment-artifacts/application-id/invoice/invoice.pdf',
    );
    expect(fixture.directPayments.findOne).toHaveBeenCalledWith({
      where: { applicationId: APPLICATION_ID },
    });
  });

  it('retries a colliding invoice number with a new number after cleaning up its artifact', async () => {
    const fixture = createFixture();
    const invoiceNumberGenerator = jest
      .spyOn(
        fixture.service as unknown as {
          generateInvoiceNumber(paymentDate: string): string;
        },
        'generateInvoiceNumber',
      )
      .mockReturnValueOnce('INV-20260812-000007')
      .mockReturnValueOnce('INV-20260812-000008');
    fixture.paymentRepository.save
      .mockRejectedValueOnce({ code: '23505' })
      .mockResolvedValueOnce(payment());

    await expect(
      fixture.service.initializePayment(APPLICATION_ID),
    ).resolves.toMatchObject({ id: PAYMENT_ID });
    expect(fixture.paymentPdf.generateInvoice).toHaveBeenCalledTimes(2);
    expect(fixture.files.savePaymentArtifact).toHaveBeenCalledTimes(2);
    expect(fixture.files.deleteIfExists).toHaveBeenCalledTimes(1);
    expect(invoiceNumberGenerator).toHaveBeenCalledTimes(2);
    expect(fixture.paymentPdf.generateInvoice).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ invoiceNumber: 'INV-20260812-000007' }),
    );
    expect(fixture.paymentPdf.generateInvoice).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ invoiceNumber: 'INV-20260812-000008' }),
    );
  });

  it('returns a conflict after exhausting invoice-number collision retries and cleans every artifact', async () => {
    const fixture = createFixture();
    fixture.paymentRepository.save.mockRejectedValue({ code: '23505' });

    await expect(
      fixture.service.initializePayment(APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
    expect(fixture.paymentPdf.generateInvoice).toHaveBeenCalledTimes(3);
    expect(fixture.files.savePaymentArtifact).toHaveBeenCalledTimes(3);
    expect(fixture.files.deleteIfExists).toHaveBeenCalledTimes(3);
  });
});

function createFixture() {
  const applicationRepository = { findOne: jest.fn() };
  const paymentRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(<T extends object>(value: T): T => value),
    save: jest.fn((value: object) =>
      Promise.resolve({ ...value, id: PAYMENT_ID }),
    ),
  };
  const appointmentRepository = {
    find: jest.fn().mockResolvedValue([appointment()]),
  };
  const vehicleRepository = { findOne: jest.fn().mockResolvedValue(vehicle()) };
  const categoryRepository = {
    findOne: jest.fn().mockResolvedValue(category()),
  };
  const query = jest.fn().mockResolvedValue([
    {
      invoiceIssuedAt: new Date('2026-08-12T00:00:00.000Z'),
      paymentDate: '2026-08-12',
      lateDays: 10,
      inspectionFeeKhr: '25000.00',
      serviceFeeKhr: '5000.00',
      baseAmount: '30000.00',
      lateFee: '5000.00',
      totalAmount: '35000.00',
    },
  ]);
  const manager = {
    getRepository: jest.fn((target: unknown) => {
      if (target === RenewalApplication) return applicationRepository;
      if (target === Payment) return paymentRepository;
      if (target === Appointment) return appointmentRepository;
      if (target === Vehicle) return vehicleRepository;
      if (target === InspectionVehicleCategory) return categoryRepository;
      throw new Error('Unexpected repository');
    }),
    query,
  };
  applicationRepository.findOne.mockResolvedValue(application());

  const transaction = jest.fn(
    (callback: (manager: typeof manager) => unknown) => callback(manager),
  );
  const dataSource = { transaction };
  const directPayments = { findOne: jest.fn().mockResolvedValue(null) };
  const files = {
    savePaymentArtifact: jest.fn().mockResolvedValue({
      storageKey: 'payment-artifacts/application-id/invoice/invoice.pdf',
    }),
    deleteIfExists: jest.fn().mockResolvedValue(undefined),
  };
  const paymentPdf = {
    generateInvoice: jest.fn().mockResolvedValue(Buffer.from('%PDF-unit')),
  };

  return {
    service: new PaymentsService(
      dataSource as unknown as DataSource,
      directPayments as unknown as Repository<Payment>,
      {} as Repository<PaymentStatusHistory>,
      {} as Repository<RenewalApplication>,
      files as unknown as FilesService,
      paymentPdf as unknown as PaymentPdfService,
    ),
    directPayments,
    query,
    applicationRepository,
    paymentRepository,
    appointmentRepository,
    vehicleRepository,
    categoryRepository,
    files,
    paymentPdf,
    transaction,
  };
}

function application(
  status = ApplicationStatus.APPROVED,
  citizenId = CITIZEN_ID,
): RenewalApplication {
  return {
    id: APPLICATION_ID,
    citizenId,
    vehicleId: 'vehicle-id',
    referenceNumber: 'VIR-20260812-ABCDEF123456',
    status,
  } as RenewalApplication;
}

function appointment(): Appointment {
  return {
    id: 'appointment-id',
    applicationId: APPLICATION_ID,
    status: AppointmentStatus.SCHEDULED,
  } as Appointment;
}

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'vehicle-id',
    plateNumber: '2A-3146',
    make: 'Toyota',
    model: 'RAV4',
    inspectionExpiryDate: '2026-08-01',
    inspectionCategoryId: 'category-id',
    ...overrides,
  } as Vehicle;
}

function category(): InspectionVehicleCategory {
  return {
    id: 'category-id',
    isActive: true,
    inspectionFeeKhr: '25000.00',
    serviceFeeKhr: '5000.00',
  } as InspectionVehicleCategory;
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
    lateFee: '5000.00',
    totalAmount: '35000.00',
    currency: 'KHR',
  } as Payment;
}
