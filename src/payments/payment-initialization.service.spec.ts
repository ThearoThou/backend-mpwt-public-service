import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { ApplicationDocument } from '../applications/entities/application-document.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { DocumentStatus } from '../applications/enums/document-status.enum';
import { DocumentType } from '../applications/enums/document-type.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { FilesService } from '../files/files.service';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { CitizenProfile } from '../users/entities/citizen-profile.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';
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
      [
        '2026-08-01',
        '25000.00',
        '0.00',
        VehicleClass.LIGHT,
        30,
        731,
        500,
        2000,
      ],
    );
    expect(fixture.paymentPdf.generateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationReferenceNumber: 'VIR-20260812-ABCDEF123456',
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '0.00',
        baseAmount: '25000.00',
        lateDays: 10,
        lateFee: '0.00',
        totalAmount: '25000.00',
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
        serviceFeeKhr: '0.00',
        baseAmount: '25000.00',
        lateDays: 10,
        lateFee: '0.00',
        totalAmount: '25000.00',
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

  it('canonically expires an overdue approved application before creating a new legacy invoice', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-06T17:00:00.000Z'));
    try {
      const fixture = createFixture();
      const overdue = application();
      overdue.submittedAt = new Date('2026-09-07T08:30:00.000Z');
      fixture.applicationRepository.findOne.mockResolvedValue(overdue);

      await expect(
        fixture.service.initializePayment(APPLICATION_ID),
      ).rejects.toMatchObject({
        code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        status: HttpStatus.CONFLICT,
      });

      expect(overdue.status).toBe(ApplicationStatus.EXPIRED);
      expect(fixture.paymentPdf.generateInvoice).not.toHaveBeenCalled();
      expect(fixture.paymentRepository.save).not.toHaveBeenCalled();
      expect(fixture.expiryHistory.save).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
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
      serviceFeeKhr: '0.00',
      baseAmount: '25000.00',
      lateDays: 10,
      lateFee: '0.00',
      totalAmount: '25000.00',
      currency: 'KHR',
    });
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('Asia/Phnom_Penh'),
      [
        '2026-08-01',
        '25000.00',
        '0.00',
        VehicleClass.LIGHT,
        30,
        731,
        500,
        2000,
      ],
    );
    expect(fixture.paymentRepository.create).not.toHaveBeenCalled();
    expect(fixture.paymentRepository.save).not.toHaveBeenCalled();
    expect(fixture.appointmentRepository.find).not.toHaveBeenCalled();
    expect(fixture.files.savePaymentArtifact).not.toHaveBeenCalled();
    expect(draft.status).toBe(ApplicationStatus.DRAFT);
  });

  it('uses the stored HEAVY vehicle class in the shared Cambodia-local late-fee calculation', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.DRAFT, CITIZEN_ID),
    );
    fixture.vehicleRepository.findOne.mockResolvedValue(
      vehicle({ vehicleClass: VehicleClass.HEAVY }),
    );

    await fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID);

    const [query, values] = fixture.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('<= $5::integer THEN 0');
    expect(query).toContain(') - $5::integer');
    expect(query).toContain("WHEN $4::text = 'LIGHT'");
    expect(query).toContain('* $7::integer');
    expect(query).toContain('* $8::integer');
    expect(values).toEqual([
      '2026-08-01',
      '25000.00',
      '0.00',
      VehicleClass.HEAVY,
      30,
      731,
      500,
      2000,
    ]);
  });

  it('returns the grace-adjusted fee estimate for a 36-day overdue HEAVY vehicle', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.DRAFT, CITIZEN_ID),
    );
    fixture.vehicleRepository.findOne.mockResolvedValue(
      vehicle({ vehicleClass: VehicleClass.HEAVY }),
    );
    fixture.query.mockResolvedValue([
      {
        invoiceIssuedAt: new Date('2026-08-12T00:00:00.000Z'),
        paymentDate: '2026-08-12',
        lateDays: 36,
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '0.00',
        baseAmount: '25000.00',
        lateFee: '12000.00',
        totalAmount: '37000.00',
      },
    ]);

    await expect(
      fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({
      lateDays: 36,
      lateFee: '12000.00',
      totalAmount: '37000.00',
    });
  });

  it('freezes the grace-adjusted fee in a new draft invoice', async () => {
    const fixture = createFixture();
    const draft = {
      ...application(ApplicationStatus.DRAFT, CITIZEN_ID),
      referenceNumber: null,
    };
    fixture.applicationRepository.findOne.mockResolvedValue(draft);
    fixture.vehicleRepository.findOne.mockResolvedValue(
      vehicle({ vehicleClass: VehicleClass.HEAVY }),
    );
    fixture.query.mockResolvedValue([
      {
        invoiceIssuedAt: new Date('2026-08-12T00:00:00.000Z'),
        paymentDate: '2026-08-12',
        lateDays: 36,
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '0.00',
        baseAmount: '25000.00',
        lateFee: '12000.00',
        totalAmount: '37000.00',
      },
    ]);

    await fixture.service.initializeCitizenDraftPayment(
      CITIZEN_ID,
      APPLICATION_ID,
    );

    expect(fixture.paymentPdf.generateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        lateDays: 36,
        lateFee: '12000.00',
        totalAmount: '37000.00',
      }),
    );
    expect(fixture.paymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lateDays: 36,
        lateFee: '12000.00',
        totalAmount: '37000.00',
      }),
    );
  });

  it.each([
    {
      name: 'a LIGHT vehicle with no late penalty',
      vehicleClass: VehicleClass.LIGHT,
      inspectionFeeKhr: '48000.00',
      lateDays: 0,
      lateFee: '0.00',
      totalAmount: '48000.00',
    },
    {
      name: 'a LIGHT vehicle 31 days overdue',
      vehicleClass: VehicleClass.LIGHT,
      inspectionFeeKhr: '48000.00',
      lateDays: 31,
      lateFee: '500.00',
      totalAmount: '48500.00',
    },
    {
      name: 'a LIGHT vehicle 36 days overdue',
      vehicleClass: VehicleClass.LIGHT,
      inspectionFeeKhr: '48000.00',
      lateDays: 36,
      lateFee: '3000.00',
      totalAmount: '51000.00',
    },
    {
      name: 'a HEAVY vehicle 36 days overdue',
      vehicleClass: VehicleClass.HEAVY,
      inspectionFeeKhr: '80000.00',
      lateDays: 36,
      lateFee: '12000.00',
      totalAmount: '92000.00',
    },
  ])(
    'returns the zero-service-fee estimate for $name',
    async ({
      vehicleClass,
      inspectionFeeKhr,
      lateDays,
      lateFee,
      totalAmount,
    }) => {
      const fixture = createFixture();
      fixture.applicationRepository.findOne.mockResolvedValue(
        application(ApplicationStatus.DRAFT, CITIZEN_ID),
      );
      fixture.vehicleRepository.findOne.mockResolvedValue(
        vehicle({ vehicleClass }),
      );
      fixture.categoryRepository.findOne.mockResolvedValue({
        ...category(),
        inspectionFeeKhr,
      });
      fixture.query.mockResolvedValueOnce([
        {
          invoiceIssuedAt: new Date('2026-08-12T00:00:00.000Z'),
          paymentDate: '2026-08-12',
          lateDays,
          inspectionFeeKhr,
          serviceFeeKhr: '0.00',
          baseAmount: inspectionFeeKhr,
          lateFee,
          totalAmount,
        },
      ]);

      await expect(
        fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID),
      ).resolves.toMatchObject({
        inspectionFeeKhr,
        serviceFeeKhr: '0.00',
        baseAmount: inspectionFeeKhr,
        lateDays,
        lateFee,
        totalAmount,
      });
      expect(fixture.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          '2026-08-01',
          inspectionFeeKhr,
          '0.00',
          vehicleClass,
        ]),
      );
    },
  );

  it('initializes one pending station-payment invoice for an owned draft without reserving capacity', async () => {
    const fixture = createFixture();
    const draft = {
      ...application(ApplicationStatus.DRAFT, CITIZEN_ID),
      referenceNumber: null,
    };
    fixture.applicationRepository.findOne.mockResolvedValue(draft);

    const result = await fixture.service.initializeCitizenDraftPayment(
      CITIZEN_ID,
      APPLICATION_ID,
    );

    expect(
      fixture.preferredScheduling.validatePreferredDate,
    ).toHaveBeenCalledWith('2026-08-12');
    expect(
      fixture.preferredScheduling.validateOptionalStationWithManager,
    ).toHaveBeenCalledWith(fixture.manager, 'station-id');
    expect(fixture.appointmentRepository.find).not.toHaveBeenCalled();
    expect(fixture.paymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        method: PaymentMethod.PAY_AT_STATION,
        status: PaymentStatus.PENDING,
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '0.00',
        lateDays: 10,
        totalAmount: '25000.00',
      }),
    );
    expect(result).toMatchObject({
      applicationId: APPLICATION_ID,
      applicationReferenceNumber: null,
      method: PaymentMethod.PAY_AT_STATION,
      status: PaymentStatus.PENDING,
      preferredInspectionDate: '2026-08-12',
      vehicle: {
        registrationNumber: 'REG-001',
        chassisNumber: 'CHASSIS-001',
      },
    });
    expect(result.invoiceNumber).toMatch(/^INV-\d{8}-\d{6}$/);
    expect(draft.status).toBe(ApplicationStatus.DRAFT);
  });

  it('initializes a draft invoice when the preferred station is omitted', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue({
      ...application(ApplicationStatus.DRAFT, CITIZEN_ID),
      preferredInspectionStationId: null,
    });

    await expect(
      fixture.service.initializeCitizenDraftPayment(CITIZEN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({ method: PaymentMethod.PAY_AT_STATION });
    expect(
      fixture.preferredScheduling.validateOptionalStationWithManager,
    ).toHaveBeenCalledWith(fixture.manager, null);
  });

  it('returns an invoice applicant with a null English name when the citizen only has a Khmer name', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue({
      ...application(ApplicationStatus.DRAFT, CITIZEN_ID),
      referenceNumber: null,
    });
    fixture.profileRepository.findOne.mockResolvedValue({
      userId: CITIZEN_ID,
      nameKh: 'ពលរដ្ឋ',
      nameEn: null,
    });

    const result = await fixture.service.initializeCitizenDraftPayment(
      CITIZEN_ID,
      APPLICATION_ID,
    );

    expect(result.applicant).toEqual({
      nameKh: 'ពលរដ្ឋ',
      nameEn: null,
      phone: '012345678',
    });
  });

  it('restores an existing draft invoice without creating another payment or invoice number', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.DRAFT, CITIZEN_ID),
    );
    const existing = payment();
    fixture.paymentRepository.findOne.mockResolvedValue(existing);

    await expect(
      fixture.service.initializeCitizenDraftPayment(CITIZEN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({
      id: PAYMENT_ID,
      invoiceNumber: existing.invoiceNumber,
    });
    expect(fixture.paymentPdf.generateInvoice).not.toHaveBeenCalled();
    expect(fixture.paymentRepository.save).not.toHaveBeenCalled();
    expect(fixture.appointmentRepository.find).not.toHaveBeenCalled();
  });

  it('rejects another citizen and non-draft applications before initialization', async () => {
    const fixture = createFixture();
    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.DRAFT, OTHER_CITIZEN_ID),
    );

    await expect(
      fixture.service.initializeCitizenDraftPayment(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });

    fixture.applicationRepository.findOne.mockResolvedValue(
      application(ApplicationStatus.SUBMITTED, CITIZEN_ID),
    );
    await expect(
      fixture.service.initializeCitizenDraftPayment(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      status: HttpStatus.CONFLICT,
    });
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
        serviceFeeKhr: '0.00',
        baseAmount: '25000.00',
        lateFee: '0.00',
        totalAmount: '25000.00',
      },
    ]);

    await expect(
      fixture.service.getCitizenFeeEstimate(CITIZEN_ID, APPLICATION_ID),
    ).resolves.toMatchObject({
      lateDays: 0,
      lateFee: '0.00',
      totalAmount: '25000.00',
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
  const applicationRepository = {
    findOne: jest.fn(),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const expiryHistory = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
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
  const documentRepository = {
    find: jest.fn().mockResolvedValue([
      ...Object.values(DocumentType).map((documentType) => ({
        applicationId: APPLICATION_ID,
        documentType,
        isCurrent: true,
        status: DocumentStatus.PENDING,
      })),
    ]),
  };
  const userRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: CITIZEN_ID, phone: '012345678' }),
  };
  const profileRepository = {
    findOne: jest.fn().mockResolvedValue({
      userId: CITIZEN_ID,
      nameKh: 'Citizen Khmer',
      nameEn: 'Citizen English',
    }),
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
      serviceFeeKhr: '0.00',
      baseAmount: '25000.00',
      lateFee: '0.00',
      totalAmount: '25000.00',
    },
  ]);
  const manager = {
    getRepository: jest.fn((target: unknown) => {
      if (target === RenewalApplication) return applicationRepository;
      if (target === Payment) return paymentRepository;
      if (target === Appointment) return appointmentRepository;
      if (target === ApplicationDocument) return documentRepository;
      if (target === User) return userRepository;
      if (target === CitizenProfile) return profileRepository;
      if (target === Vehicle) return vehicleRepository;
      if (target === InspectionVehicleCategory) return categoryRepository;
      if (target === RenewalApplicationStatusHistory) return expiryHistory;
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
  const preferredScheduling = {
    validatePreferredDate: jest.fn(),
    validateOptionalStationWithManager: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new PaymentsService(
      dataSource as unknown as DataSource,
      directPayments as unknown as Repository<Payment>,
      {} as Repository<PaymentStatusHistory>,
      {} as Repository<RenewalApplication>,
      files as unknown as FilesService,
      paymentPdf as unknown as PaymentPdfService,
      preferredScheduling as never,
    ),
    directPayments,
    query,
    applicationRepository,
    paymentRepository,
    appointmentRepository,
    documentRepository,
    profileRepository,
    vehicleRepository,
    categoryRepository,
    files,
    manager,
    paymentPdf,
    preferredScheduling,
    expiryHistory,
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
    preferredInspectionStationId: 'station-id',
    preferredInspectionDate: '2026-08-12',
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
    linkedCitizenId: CITIZEN_ID,
    registrationNumber: 'REG-001',
    plateNumber: '2A-3146',
    make: 'Toyota',
    model: 'RAV4',
    manufactureYear: 2022,
    chassisNumber: 'CHASSIS-001',
    inspectionExpiryDate: '2026-08-01',
    inspectionCategoryId: 'category-id',
    vehicleClass: VehicleClass.LIGHT,
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
