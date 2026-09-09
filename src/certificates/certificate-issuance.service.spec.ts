import { HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';

import { ApplicationTimelineEvent } from '../activity/entities/application-timeline-event.entity';
import { TimelineEventType } from '../activity/enums/timeline-event-type.enum';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Sticker } from '../stickers/entities/sticker.entity';
import type { CertificatePdfInput } from './certificate-pdf.service';
import { CertificateIssuanceService } from './certificate-issuance.service';
import { TechnicalInspectionCertificate } from './entities/technical-inspection-certificate.entity';

describe('CertificateIssuanceService', () => {
  it('issues one certificate and completes the application with one database T', async () => {
    const fixture = createFixture();

    const response = await fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
      certificateNumber: '  MPWT-2026-001  ',
    });

    expect(fixture.lock.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(fixture.databaseQuery).toHaveBeenCalledWith('SELECT now() AS "now"');
    expect(fixture.pdf.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        certificate: {
          certificateNumber: 'MPWT-2026-001',
          issuedAt: DATABASE_TIME,
        },
        inspection: {
          completedAt: fixture.inspection.completedAt,
          validUntil: fixture.inspection.validUntil,
        },
        note: null,
      }),
    );
    expect(fixture.pdf.generate.mock.calls[0][0].vehicle).toMatchObject({
      make: 'HYUNDAI',
      model: 'STARIA',
      engineNumber: 'ENGINE-ORIGINAL',
      chassisNumber: 'CHASSIS-ORIGINAL',
      enginePowerHp: '177.50',
    });
    expect(fixture.certificates.create).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      inspectionId: INSPECTION_ID,
      certificateNumber: 'MPWT-2026-001',
      issuedAt: DATABASE_TIME,
      issuedByUserId: ADMIN_ID,
      artifactFileKey: ARTIFACT_KEY,
    });
    expect(fixture.application.status).toBe(ApplicationStatus.COMPLETED);
    expect(fixture.application.completedAt).toBe(DATABASE_TIME);
    expect(fixture.history.create).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      previousStatus: ApplicationStatus.APPROVED,
      newStatus: ApplicationStatus.COMPLETED,
      changedByUserId: ADMIN_ID,
      reason: 'TECHNICAL_CERTIFICATE_ISSUED',
      createdAt: DATABASE_TIME,
    });
    expect(fixture.events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APPLICATION_ID,
        eventType: TimelineEventType.APPLICATION_COMPLETED,
        actorUserId: ADMIN_ID,
        occurredAt: DATABASE_TIME,
        createdAt: DATABASE_TIME,
      }),
    );
    expect(response).toEqual({
      issued: true,
      certificateNumber: 'MPWT-2026-001',
      issuedAt: DATABASE_TIME.toISOString(),
      inspectionDate: '2026-09-09',
      expiryDate: '2030-09-09',
      downloadAvailable: true,
    });
    expect(response).not.toHaveProperty('artifactFileKey');
    expect(response).not.toHaveProperty('issuedByUserId');
    expect(fixture.payments.save).not.toHaveBeenCalled();
    expect(fixture.inspections.save).not.toHaveBeenCalled();
    expect(fixture.stickers.save).not.toHaveBeenCalled();
  });

  it('uses the frozen snapshot even if a live vehicle has different values', async () => {
    const fixture = createFixture();
    fixture.application.vehicle = {
      make: 'CHANGED LIVE MAKE',
      engineNumber: 'CHANGED-LIVE-ENGINE',
    } as never;

    await fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
      certificateNumber: 'CERT-1',
    });

    const vehicle = fixture.pdf.generate.mock.calls[0][0].vehicle;
    expect(vehicle.make).toBe('HYUNDAI');
    expect(vehicle.engineNumber).toBe('ENGINE-ORIGINAL');
    expect(JSON.stringify(vehicle)).not.toContain('CHANGED LIVE');
  });

  it('permits issuance through the end of Cambodia Day 30', async () => {
    const fixture = createFixture();
    fixture.application.submittedAt = new Date('2026-08-12T05:00:00.000Z');
    fixture.databaseQuery.mockResolvedValue([
      { now: new Date('2026-09-10T16:59:59.999Z') },
    ]);

    await expect(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-DAY-30',
      }),
    ).resolves.toMatchObject({ issued: true });
  });

  it('canonically expires at Cambodia Day 31 before PDF or storage', async () => {
    const fixture = createFixture();
    fixture.application.submittedAt = new Date('2026-08-12T05:00:00.000Z');
    fixture.databaseQuery.mockResolvedValue([
      { now: new Date('2026-09-10T17:00:00.000Z') },
    ]);

    await expectCode(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-DAY-31',
      }),
      ApiErrorCode.CERTIFICATE_NOT_READY,
    );
    expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
    expect(fixture.pdf.generate).not.toHaveBeenCalled();
    expect(fixture.files.saveCertificateArtifact).not.toHaveBeenCalled();
    expect(fixture.certificates.save).not.toHaveBeenCalled();
  });

  it.each([
    ApplicationStatus.DRAFT,
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.CORRECTION_REQUIRED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.INSPECTION_FAILED,
    ApplicationStatus.EXPIRED,
    ApplicationStatus.CANCELLED,
    ApplicationStatus.COMPLETED,
  ])('rejects non-APPROVED status %s', async (status) => {
    const fixture = createFixture();
    fixture.application.status = status;
    await expectCode(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-1',
      }),
      ApiErrorCode.CERTIFICATE_NOT_READY,
    );
    expect(fixture.pdf.generate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'readyForInspectionAt',
      (fixture: Fixture) => (fixture.application.readyForInspectionAt = null),
    ],
    ['payment', (fixture: Fixture) => (fixture.paymentValue = null)],
    [
      'confirmed payment',
      (fixture: Fixture) => (fixture.payment.status = PaymentStatus.PENDING),
    ],
    [
      'payment ownership',
      (fixture: Fixture) =>
        (fixture.payment.applicationId = OTHER_APPLICATION_ID),
    ],
    [
      'primary inspection',
      (fixture: Fixture) => (fixture.inspectionValue = null),
    ],
    [
      'attempt one',
      (fixture: Fixture) => (fixture.inspection.attemptNumber = 2),
    ],
    [
      'PASS inspection',
      (fixture: Fixture) => (fixture.inspection.result = InspectionResult.FAIL),
    ],
    [
      'completed inspection',
      (fixture: Fixture) => (fixture.inspection.completedAt = null),
    ],
    [
      'inspection validity',
      (fixture: Fixture) => (fixture.inspection.validUntil = null),
    ],
    [
      'inspection ownership',
      (fixture: Fixture) =>
        (fixture.inspection.applicationId = OTHER_APPLICATION_ID),
    ],
    ['sticker', (fixture: Fixture) => (fixture.stickerValue = null)],
    [
      'sticker ownership',
      (fixture: Fixture) =>
        (fixture.sticker.applicationId = OTHER_APPLICATION_ID),
    ],
    [
      'sticker inspection link',
      (fixture: Fixture) => (fixture.sticker.inspectionId = 'other-inspection'),
    ],
    ['issued sticker', (fixture: Fixture) => (fixture.sticker.issuedAt = null)],
    ['DOCUMENTS_APPROVED', (fixture: Fixture) => (fixture.eventValue = null)],
    [
      'DOCUMENTS_APPROVED ownership',
      (fixture: Fixture) =>
        (fixture.event.applicationId = OTHER_APPLICATION_ID),
    ],
  ] as const)('rejects missing or incoherent %s', async (_name, mutate) => {
    const fixture = createFixture();
    mutate(fixture);

    await expectCode(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-1',
      }),
      ApiErrorCode.CERTIFICATE_NOT_READY,
    );
    expect(fixture.pdf.generate).not.toHaveBeenCalled();
    expect(fixture.files.saveCertificateArtifact).not.toHaveBeenCalled();
  });

  it('uses the latest DOCUMENTS_APPROVED event deterministically', async () => {
    const fixture = createFixture();
    await fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
      certificateNumber: 'CERT-1',
    });
    expect(fixture.events.findOne).toHaveBeenCalledWith({
      where: {
        applicationId: APPLICATION_ID,
        eventType: TimelineEventType.DOCUMENTS_APPROVED,
      },
      order: { occurredAt: 'DESC', id: 'DESC' },
    });
  });

  it('rejects an existing application or inspection certificate before rendering', async () => {
    for (const owner of ['application', 'inspection'] as const) {
      const fixture = createFixture();
      fixture.existingCertificateOwner = owner;
      await expectCode(
        fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
          certificateNumber: 'CERT-1',
        }),
        ApiErrorCode.CERTIFICATE_ALREADY_EXISTS,
      );
      expect(fixture.pdf.generate).not.toHaveBeenCalled();
    }
  });

  it('rejects a repeated request without regenerating or writing completion facts', async () => {
    const fixture = createFixture();
    fixture.certificates.save.mockImplementation((value: unknown) => {
      fixture.existingCertificateOwner = 'application';
      return Promise.resolve(value);
    });

    await fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
      certificateNumber: 'CERT-FIRST',
    });
    await expectCode(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-REPLACEMENT',
      }),
      ApiErrorCode.CERTIFICATE_ALREADY_EXISTS,
    );

    expect(fixture.pdf.generate).toHaveBeenCalledTimes(1);
    expect(fixture.files.saveCertificateArtifact).toHaveBeenCalledTimes(1);
    expect(fixture.certificates.save).toHaveBeenCalledTimes(1);
    expect(fixture.applications.save).toHaveBeenCalledTimes(1);
    expect(fixture.history.save).toHaveBeenCalledTimes(1);
    expect(fixture.events.save).toHaveBeenCalledTimes(1);
  });

  it('rejects an already-used ADMIN certificate number before rendering', async () => {
    const fixture = createFixture();
    fixture.existingCertificateNumber = 'CERT-1';
    await expectCode(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-1',
      }),
      ApiErrorCode.CERTIFICATE_NUMBER_CONFLICT,
    );
    expect(fixture.pdf.generate).not.toHaveBeenCalled();
  });

  it('rejects missing snapshot data before browser rendering or storage', async () => {
    const fixture = createFixture();
    delete fixture.application.vehicleSnapshot?.enginePowerHp;
    fixture.pdf.generate.mockRejectedValue(
      new Error('Certificate PDF field is required: vehicle.enginePowerHp'),
    );

    await expectCode(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-1',
      }),
      ApiErrorCode.CERTIFICATE_NOT_READY,
    );
    expect(fixture.files.saveCertificateArtifact).not.toHaveBeenCalled();
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
  });

  it('leaves completion absent when PDF or artifact storage fails', async () => {
    for (const stage of ['pdf', 'storage'] as const) {
      const fixture = createFixture();
      const original = new Error(`${stage} failed`);
      if (stage === 'pdf') fixture.pdf.generate.mockRejectedValue(original);
      else fixture.files.saveCertificateArtifact.mockRejectedValue(original);

      await expect(
        fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
          certificateNumber: 'CERT-1',
        }),
      ).rejects.toBe(original);
      expect(fixture.certificates.save).not.toHaveBeenCalled();
      expect(fixture.history.save).not.toHaveBeenCalled();
      expect(fixture.events.save).not.toHaveBeenCalled();
      expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
    }
  });

  it('cleans a stored artifact after a later database failure', async () => {
    const fixture = createFixture();
    const original = new Error('history insert failed');
    fixture.history.save.mockRejectedValue(original);

    await expect(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-1',
      }),
    ).rejects.toBe(original);
    expect(fixture.files.deleteIfExists).toHaveBeenCalledWith(ARTIFACT_KEY);
  });

  it('does not replace the original DB error when cleanup also fails', async () => {
    const fixture = createFixture();
    const original = new Error('completion event insert failed');
    fixture.events.save.mockRejectedValue(original);
    fixture.files.deleteIfExists.mockRejectedValue(new Error('cleanup failed'));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-1',
      }),
    ).rejects.toBe(original);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('keeps different applications with the same number concurrency-safe and cleans the losing artifact', async () => {
    const winner = createFixture();
    const loser = createFixture();
    loser.application.id = OTHER_APPLICATION_ID;
    loser.payment.applicationId = OTHER_APPLICATION_ID;
    loser.inspection.applicationId = OTHER_APPLICATION_ID;
    loser.sticker.applicationId = OTHER_APPLICATION_ID;
    loser.event.applicationId = OTHER_APPLICATION_ID;
    loser.certificates.save.mockRejectedValue(
      uniqueViolation('uq_technical_inspection_certificates_number'),
    );

    const outcomes = await Promise.allSettled([
      winner.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'SHARED-CERT',
      }),
      loser.service.issue(OTHER_APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'SHARED-CERT',
      }),
    ]);

    expect(outcomes[0].status).toBe('fulfilled');
    expect(outcomes[1].status).toBe('rejected');
    if (outcomes[1].status !== 'rejected') {
      throw new Error('Expected the duplicate certificate number to lose');
    }
    expect(outcomes[1].reason).toBeInstanceOf(DomainException);
    expect((outcomes[1].reason as DomainException).code).toBe(
      ApiErrorCode.CERTIFICATE_NUMBER_CONFLICT,
    );
    expect(loser.files.deleteIfExists).toHaveBeenCalled();
    expect(loser.applications.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: ApplicationStatus.COMPLETED }),
    );
    expect(winner.history.save).toHaveBeenCalledTimes(1);
    expect(winner.events.save).toHaveBeenCalledTimes(1);
    expect(loser.history.save).not.toHaveBeenCalled();
    expect(loser.events.save).not.toHaveBeenCalled();
  });

  it.each(['same number', 'different numbers'])(
    'keeps concurrent requests for the same application with %s safe',
    async (numberCase) => {
      const fixture = createFixture();
      fixture.certificates.save.mockImplementation((value: unknown) => {
        fixture.existingCertificateOwner = 'application';
        return Promise.resolve(value);
      });
      serializeTransactions(fixture);

      const outcomes = await Promise.allSettled([
        fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
          certificateNumber: 'CERT-FIRST',
        }),
        fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
          certificateNumber:
            numberCase === 'same number' ? 'CERT-FIRST' : 'CERT-SECOND',
        }),
      ]);

      expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      expect(fixture.certificates.save).toHaveBeenCalledTimes(1);
      expect(fixture.files.saveCertificateArtifact).toHaveBeenCalledTimes(1);
      expect(fixture.applications.save).toHaveBeenCalledTimes(1);
      expect(fixture.history.save).toHaveBeenCalledTimes(1);
      expect(fixture.events.save).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects legacy COMPLETED without fabricating a certificate', async () => {
    const fixture = createFixture();
    fixture.application.status = ApplicationStatus.COMPLETED;
    fixture.application.completedAt = new Date('2025-01-01T00:00:00.000Z');
    const legacyCompletedAt = fixture.application.completedAt;

    await expectCode(
      fixture.service.issue(APPLICATION_ID, ADMIN_ID, {
        certificateNumber: 'CERT-1',
      }),
      ApiErrorCode.CERTIFICATE_NOT_READY,
    );
    expect(fixture.application.completedAt).toBe(legacyCompletedAt);
    expect(fixture.pdf.generate).not.toHaveBeenCalled();
    expect(fixture.certificates.save).not.toHaveBeenCalled();
  });
});

const APPLICATION_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_APPLICATION_ID = '00000000-0000-4000-8000-000000000002';
const INSPECTION_ID = '00000000-0000-4000-8000-000000000003';
const ADMIN_ID = '00000000-0000-4000-8000-000000000004';
const ARTIFACT_KEY = `certificate-artifacts/${APPLICATION_ID}/artifact.pdf`;
const DATABASE_TIME = new Date('2026-09-09T10:00:00.000Z');

function createFixture() {
  const application = {
    id: APPLICATION_ID,
    status: ApplicationStatus.APPROVED,
    submittedAt: new Date('2026-09-01T03:00:00.000Z'),
    readyForInspectionAt: new Date('2026-09-02T03:00:00.000Z'),
    completedAt: null,
    vehicleSnapshot: vehicleSnapshot(),
  } as RenewalApplication;
  const payment = {
    applicationId: APPLICATION_ID,
    status: PaymentStatus.CONFIRMED,
  } as Payment;
  const inspection = {
    id: INSPECTION_ID,
    applicationId: APPLICATION_ID,
    attemptNumber: 1,
    status: InspectionStatus.COMPLETED,
    result: InspectionResult.PASS,
    completedAt: new Date('2026-09-09T02:00:00.000Z'),
    validUntil: '2030-09-09',
  } as Inspection;
  const sticker = {
    applicationId: APPLICATION_ID,
    inspectionId: INSPECTION_ID,
    issuedAt: new Date('2026-09-09T05:00:00.000Z'),
  } as Sticker;
  const event = {
    id: 'event-id',
    applicationId: APPLICATION_ID,
    eventType: TimelineEventType.DOCUMENTS_APPROVED,
    occurredAt: new Date('2026-09-09T08:00:00.000Z'),
  } as ApplicationTimelineEvent;
  const lock = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(application),
  };
  const applications = repository({
    createQueryBuilder: jest.fn(() => lock),
  });
  const payments = repository();
  const inspections = repository();
  const stickers = repository();
  const history = repository();
  const events = repository();
  const certificates = repository();
  const databaseQuery = jest.fn().mockResolvedValue([{ now: DATABASE_TIME }]);
  const pdf = {
    generate: jest.fn((input: CertificatePdfInput): Promise<Buffer> => {
      void input;
      return Promise.resolve(Buffer.from('%PDF-certificate'));
    }),
  };
  const fixture = {
    application,
    payment,
    inspection,
    sticker,
    event,
    paymentValue: payment as Payment | null,
    inspectionValue: inspection as Inspection | null,
    stickerValue: sticker as Sticker | null,
    eventValue: event as ApplicationTimelineEvent | null,
    existingCertificateOwner: null as 'application' | 'inspection' | null,
    existingCertificateNumber: null as string | null,
    lock,
    applications,
    payments,
    inspections,
    stickers,
    history,
    events,
    certificates,
    databaseQuery,
    pdf,
    files: {
      saveCertificateArtifact: jest
        .fn()
        .mockResolvedValue({ storageKey: ARTIFACT_KEY }),
      deleteIfExists: jest.fn().mockResolvedValue(undefined),
    },
    manager: null as unknown as EntityManager & { query: jest.Mock },
    service: null as unknown as CertificateIssuanceService,
  };
  payments.findOne.mockImplementation(() =>
    Promise.resolve(fixture.paymentValue),
  );
  inspections.findOne.mockImplementation(() =>
    Promise.resolve(fixture.inspectionValue),
  );
  stickers.findOne.mockImplementation(() =>
    Promise.resolve(fixture.stickerValue),
  );
  events.findOne.mockImplementation(() => Promise.resolve(fixture.eventValue));
  certificates.findOne.mockImplementation(
    (options: { where: Record<string, unknown> }) => {
      const where = options.where;
      if (
        'applicationId' in where &&
        fixture.existingCertificateOwner === 'application'
      ) {
        return Promise.resolve({ applicationId: APPLICATION_ID });
      }
      if (
        'inspectionId' in where &&
        fixture.existingCertificateOwner === 'inspection'
      ) {
        return Promise.resolve({ inspectionId: INSPECTION_ID });
      }
      if (
        'certificateNumber' in where &&
        fixture.existingCertificateNumber === where.certificateNumber
      ) {
        return Promise.resolve({ certificateNumber: where.certificateNumber });
      }
      return Promise.resolve(null);
    },
  );
  fixture.manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === RenewalApplication) return applications;
      if (entity === Payment) return payments;
      if (entity === Inspection) return inspections;
      if (entity === Sticker) return stickers;
      if (entity === RenewalApplicationStatusHistory) return history;
      if (entity === ApplicationTimelineEvent) return events;
      if (entity === TechnicalInspectionCertificate) return certificates;
      throw new Error('Unexpected repository');
    }),
    query: databaseQuery,
  } as unknown as EntityManager & { query: jest.Mock };
  const dataSource = {
    transaction: jest.fn((operation: (manager: EntityManager) => unknown) =>
      operation(fixture.manager),
    ),
  } as unknown as DataSource;
  fixture.service = new CertificateIssuanceService(
    dataSource,
    fixture.pdf as never,
    fixture.files as never,
  );
  return fixture;
}

type Fixture = ReturnType<typeof createFixture>;

function repository(overrides: Record<string, unknown> = {}) {
  return {
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    ...overrides,
  };
}

function vehicleSnapshot(): RenewalApplication['vehicleSnapshot'] {
  return {
    make: 'HYUNDAI',
    model: 'STARIA',
    manufactureYear: 2022,
    vehicleType: 'PASSENGER_VAN',
    colour: 'White',
    engineNumber: 'ENGINE-ORIGINAL',
    chassisNumber: 'CHASSIS-ORIGINAL',
    numberOfCylinders: 4,
    engineDisplacementCc: 2199,
    enginePowerHp: '177.50',
    fuelType: 'Diesel',
    numberOfSeats: 11,
    numberOfAxles: 2,
    steering: 'Left',
    vehicleWeightKg: 2200,
    maximumLoadKg: 220,
    maximumGrossWeightKg: 2970,
    wheelSize: '235/55R18',
    lengthMm: 5250,
    widthMm: 2000,
    heightMm: 1900,
  } as RenewalApplication['vehicleSnapshot'];
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(DomainException);
  expect((thrown as DomainException).code).toBe(code);
  expect((thrown as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
}

function uniqueViolation(constraint: string): QueryFailedError {
  return new QueryFailedError('INSERT', [], {
    code: '23505',
    constraint,
  });
}

function serializeTransactions(fixture: Fixture): void {
  let tail = Promise.resolve();
  const dataSource = {
    transaction: jest.fn(
      (operation: (manager: EntityManager) => Promise<unknown>) => {
        const result = tail.then(() => operation(fixture.manager));
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    ),
  } as unknown as DataSource;
  fixture.service = new CertificateIssuanceService(
    dataSource,
    fixture.pdf as never,
    fixture.files as never,
  );
}
