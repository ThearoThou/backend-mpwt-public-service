import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { ApplicationStatus } from './enums/application-status.enum';
import {
  isTechnicalCertificateIssuanceReady,
  type TechnicalCertificateReadinessFacts,
} from './technical-certificate-readiness';

describe('technical certificate readiness foundation', () => {
  const now = new Date('2026-09-20T00:00:00.000Z');

  it('accepts one coherent set of unexpired Step-06 facts', () => {
    expect(isTechnicalCertificateIssuanceReady(readyFacts(), now)).toBe(true);
  });

  it.each<[string, (facts: TechnicalCertificateReadinessFacts) => void]>([
    [
      'missing readyForInspectionAt',
      (facts) => (facts.application.readyForInspectionAt = null),
    ],
    [
      'attempt number other than one',
      (facts) => (facts.primaryInspection!.attemptNumber = 2),
    ],
    [
      'missing validUntil',
      (facts) => (facts.primaryInspection!.validUntil = null),
    ],
    [
      'mismatched payment application',
      (facts) => (facts.payment!.applicationId = 'other-application'),
    ],
    [
      'mismatched inspection application',
      (facts) => (facts.primaryInspection!.applicationId = 'other-application'),
    ],
    [
      'mismatched sticker application',
      (facts) => (facts.sticker!.applicationId = 'other-application'),
    ],
    [
      'sticker linked to another inspection',
      (facts) => (facts.sticker!.inspectionId = 'other-inspection'),
    ],
    [
      'DOCUMENTS_APPROVED from another application',
      (facts) =>
        (facts.documentsApprovedEvent!.applicationId = 'other-application'),
    ],
    [
      'existing certificate',
      (facts) =>
        (facts.existingCertificate = { applicationId: 'application-id' }),
    ],
  ])('rejects %s', (_name, mutate) => {
    const facts = readyFacts();
    mutate(facts);
    expect(isTechnicalCertificateIssuanceReady(facts, now)).toBe(false);
  });

  it.each<[string, (facts: TechnicalCertificateReadinessFacts) => void]>([
    [
      'application not approved',
      (facts) => (facts.application.status = ApplicationStatus.UNDER_REVIEW),
    ],
    ['missing submittedAt', (facts) => (facts.application.submittedAt = null)],
    ['missing payment', (facts) => (facts.payment = null)],
    [
      'unconfirmed payment',
      (facts) => (facts.payment!.status = PaymentStatus.PENDING),
    ],
    ['missing inspection', (facts) => (facts.primaryInspection = null)],
    [
      'incomplete inspection',
      (facts) => (facts.primaryInspection!.completedAt = null),
    ],
    [
      'failed inspection',
      (facts) => (facts.primaryInspection!.result = InspectionResult.FAIL),
    ],
    ['missing sticker', (facts) => (facts.sticker = null)],
    ['unissued sticker', (facts) => (facts.sticker!.issuedAt = null)],
    [
      'missing DOCUMENTS_APPROVED',
      (facts) => (facts.documentsApprovedEvent = null),
    ],
  ])('retains the existing rejection for %s', (_name, mutate) => {
    const facts = readyFacts();
    mutate(facts);
    expect(isTechnicalCertificateIssuanceReady(facts, now)).toBe(false);
  });

  it('retains the original Cambodia Day-31 expiry boundary', () => {
    expect(
      isTechnicalCertificateIssuanceReady(
        readyFacts(),
        new Date('2026-10-06T17:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

function readyFacts(): TechnicalCertificateReadinessFacts {
  return {
    application: {
      id: 'application-id',
      status: ApplicationStatus.APPROVED,
      submittedAt: new Date('2026-09-07T08:30:00.000Z'),
      readyForInspectionAt: new Date('2026-09-08T03:00:00.000Z'),
    },
    payment: {
      applicationId: 'application-id',
      status: PaymentStatus.CONFIRMED,
    },
    primaryInspection: {
      id: 'inspection-id',
      applicationId: 'application-id',
      attemptNumber: 1,
      status: InspectionStatus.COMPLETED,
      result: InspectionResult.PASS,
      completedAt: new Date('2026-09-10T03:00:00.000Z'),
      validUntil: '2030-09-10',
    },
    sticker: {
      applicationId: 'application-id',
      inspectionId: 'inspection-id',
      issuedAt: new Date('2026-09-11T03:00:00.000Z'),
    },
    documentsApprovedEvent: {
      applicationId: 'application-id',
      occurredAt: new Date('2026-09-12T03:00:00.000Z'),
    },
    existingCertificate: null,
  };
}
