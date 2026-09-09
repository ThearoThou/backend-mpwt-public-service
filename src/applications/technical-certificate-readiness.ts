import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { ApplicationStatus } from './enums/application-status.enum';
import { isInitialApplicationPeriodExpired } from './initial-application-expiry';

export interface TechnicalCertificateReadinessFacts {
  application: {
    id: string;
    status: ApplicationStatus;
    submittedAt: Date | null;
    readyForInspectionAt: Date | null;
  };
  payment: { applicationId: string; status: PaymentStatus } | null;
  primaryInspection: {
    id: string;
    applicationId: string;
    attemptNumber: number;
    status: InspectionStatus;
    result: InspectionResult | null;
    completedAt: Date | null;
    validUntil: string | null;
  } | null;
  sticker: {
    applicationId: string;
    inspectionId: string;
    issuedAt: Date | null;
  } | null;
  documentsApprovedEvent: {
    applicationId: string;
    occurredAt: Date;
  } | null;
  existingCertificate: { applicationId: string } | null;
}

/** Pure Step-06 gate over coherently loaded database facts. */
export function isTechnicalCertificateIssuanceReady(
  facts: TechnicalCertificateReadinessFacts,
  now: Date,
): boolean {
  const { application, payment, primaryInspection, sticker } = facts;
  return (
    application.status === ApplicationStatus.APPROVED &&
    application.submittedAt !== null &&
    application.readyForInspectionAt !== null &&
    !isInitialApplicationPeriodExpired(application.submittedAt, now) &&
    payment !== null &&
    payment.applicationId === application.id &&
    payment.status === PaymentStatus.CONFIRMED &&
    primaryInspection !== null &&
    primaryInspection.applicationId === application.id &&
    primaryInspection.attemptNumber === 1 &&
    primaryInspection.status === InspectionStatus.COMPLETED &&
    primaryInspection.result === InspectionResult.PASS &&
    primaryInspection.completedAt !== null &&
    primaryInspection.validUntil !== null &&
    sticker !== null &&
    sticker.applicationId === application.id &&
    sticker.inspectionId === primaryInspection.id &&
    sticker.issuedAt !== null &&
    facts.documentsApprovedEvent !== null &&
    facts.documentsApprovedEvent.applicationId === application.id &&
    facts.existingCertificate === null
  );
}
