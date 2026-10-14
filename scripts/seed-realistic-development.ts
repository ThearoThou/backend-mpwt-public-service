import 'dotenv/config';

import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';

import { ApplicationTimelineEvent } from '../src/activity/entities/application-timeline-event.entity';
import { TimelineEventType } from '../src/activity/enums/timeline-event-type.enum';
import { AUTH_ARGON2ID_OPTIONS } from '../src/auth/auth-hashing.service';
import { createApplicationVehicleSnapshot } from '../src/applications/application-vehicle-snapshot';
import { ApplicationDocument } from '../src/applications/entities/application-document.entity';
import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from '../src/applications/entities/renewal-application-status-history.entity';
import { ApplicationStatus } from '../src/applications/enums/application-status.enum';
import { DocumentStatus } from '../src/applications/enums/document-status.enum';
import { DocumentType } from '../src/applications/enums/document-type.enum';
import { TechnicalInspectionCertificate } from '../src/certificates/entities/technical-inspection-certificate.entity';
import { generateCertificateNumber } from '../src/certificates/certificate-issuance.service';
import { CertificatePdfService } from '../src/certificates/certificate-pdf.service';
import { inspectionPolicy } from '../src/config/inspection-policy';
import { FilesService } from '../src/files/files.service';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';
import { Inspection } from '../src/inspections/entities/inspection.entity';
import { InspectionResult } from '../src/inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../src/inspections/enums/inspection-status.enum';
import { InspectionValidityRule } from '../src/inspections/enums/inspection-validity-rule.enum';
import { chargeableLateDays } from '../src/payments/late-penalty-policy';
import { PaymentPdfService } from '../src/payments/payment-pdf.service';
import { Payment } from '../src/payments/entities/payment.entity';
import { PaymentMethod } from '../src/payments/enums/payment-method.enum';
import { PaymentStatus } from '../src/payments/enums/payment-status.enum';
import {
  generateInvoiceNumber,
  generateReceiptNumber,
} from '../src/payments/payments.service';
import { OPTIONAL_OVERSIZE_SERVICE_FEE_KHR } from '../src/payments/optional-oversize-service';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { Sticker } from '../src/stickers/entities/sticker.entity';
import { CitizenProfile } from '../src/users/entities/citizen-profile.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { Vehicle } from '../src/vehicles/entities/vehicle.entity';
import { VehicleClass } from '../src/vehicles/enums/vehicle-class.enum';
import { VehiclePlateCategory } from '../src/vehicles/enums/vehicle-plate-category.enum';
import {
  REALISTIC_VEHICLES,
  WORKFLOW_APPLICATION_STATUS,
  type RealisticVehicleFixture,
  type WorkflowScenario,
} from './realistic-development-fixtures';

const requireFromScript = createRequire(__filename);
const PASSWORD = '12345678';

export interface RealisticSeedCounts {
  users: number;
  administrators: number;
  citizens: number;
  vehicles: number;
  citizenOneVehicles: number;
  citizenTwoVehicles: number;
  applications: number;
  inspections: number;
  stickers: number;
  certificates: number;
  optionalEligibleVehicles: number;
  optionalSelectedApplications: number;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addYears(date: string, years: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
}

function timestampDaysAgo(days: number, hour = 2): Date {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
}

function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

interface WorkflowMilestones {
  submitted: Date;
  payment: Date;
  inspection: Date;
  sticker: Date;
  documents: Date;
  completed: Date;
}

function workflowMilestones(
  workflow: WorkflowScenario,
  vehicle: Vehicle,
  category: InspectionVehicleCategory,
): WorkflowMilestones {
  if (workflow === 'PRIMARY_FAIL_TERMINAL') {
    const payment = timestampDaysAgo(115, 2);
    return {
      submitted: timestampDaysAgo(120),
      payment,
      inspection: addMinutes(payment, 15),
      sticker: addMinutes(payment, 25),
      documents: addMinutes(payment, 35),
      completed: addMinutes(payment, 45),
    };
  }
  if (workflow !== 'COMPLETED_WITH_CERTIFICATE') {
    const payment = timestampDaysAgo(8, 2);
    return {
      submitted: timestampDaysAgo(13),
      payment,
      inspection: addMinutes(payment, 15),
      sticker: addMinutes(payment, 25),
      documents: addMinutes(payment, 35),
      completed: addMinutes(payment, 45),
    };
  }
  const inspection = new Date(`${vehicle.inspectionExpiryDate}T02:00:00.000Z`);
  inspection.setUTCMonth(inspection.getUTCMonth() - category.validityMonths);
  const shifted = (days: number): Date => {
    const value = new Date(inspection);
    value.setUTCDate(value.getUTCDate() + days);
    return value;
  };
  return {
    submitted: shifted(-13),
    payment: addMinutes(inspection, -15),
    inspection,
    sticker: addMinutes(inspection, 10),
    documents: addMinutes(inspection, 20),
    completed: addMinutes(inspection, 30),
  };
}

function seededApplicationReference(
  submittedAt: Date,
  sequence: number,
): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  })
    .format(submittedAt)
    .replaceAll('-', '');
  return `MPWT-${date}-${sequence.toString(16).toUpperCase().padStart(6, '0')}`;
}

function paymentStatus(scenario: WorkflowScenario): PaymentStatus {
  if (scenario === 'WAITING_PAYMENT_CONFIRMATION' || scenario === 'CANCELLED') {
    return PaymentStatus.PENDING;
  }
  return PaymentStatus.CONFIRMED;
}

function hasInspection(scenario: WorkflowScenario): boolean {
  return [
    'PRIMARY_PASS_WAITING_STICKER',
    'PASS_WAITING_STICKER',
    'PRIMARY_FAIL_TERMINAL',
    'STICKER_ISSUED_WAITING_DOCUMENT_REVIEW',
    'DOCUMENTS_UNDER_REVIEW',
    'DOCUMENTS_APPROVED_WAITING_CERTIFICATE',
    'CORRECTION_REQUIRED',
    'CORRECTION_REPLACED_PENDING',
    'REJECTED',
    'COMPLETED_WITH_CERTIFICATE',
  ].includes(scenario);
}

async function createCanonicalWorkflowTimeline(
  manager: EntityManager,
  application: RenewalApplication,
  workflow: WorkflowScenario,
  milestones: WorkflowMilestones,
  admin: User,
): Promise<void> {
  if (workflow === 'DRAFT') return;
  const events = manager.getRepository(ApplicationTimelineEvent);
  const add = (eventType: TimelineEventType, title: string, occurredAt: Date) =>
    events.create({
      applicationId: application.id,
      eventType,
      title,
      message: null,
      actorUserId: admin.id,
      visibleToCitizen: true,
      metadata: null,
      occurredAt,
      createdAt: occurredAt,
    });
  const timeline: ApplicationTimelineEvent[] = [
    add(
      TimelineEventType.APPLICATION_SUBMITTED,
      'Application submitted',
      milestones.submitted,
    ),
  ];
  if (paymentStatus(workflow) === PaymentStatus.CONFIRMED) {
    timeline.push(
      add(
        TimelineEventType.PAYMENT_CONFIRMED,
        'Payment confirmed',
        milestones.payment,
      ),
    );
  }
  if (workflow === 'CANCELLED') {
    timeline.push(
      add(
        TimelineEventType.APPLICATION_CANCELLED,
        'Application cancelled',
        milestones.documents,
      ),
    );
  }
  if (hasInspection(workflow)) {
    timeline.push(
      add(
        hasPassedInspection(workflow)
          ? TimelineEventType.INSPECTION_PASSED
          : TimelineEventType.INSPECTION_FAILED,
        hasPassedInspection(workflow)
          ? 'Physical inspection passed'
          : 'Physical inspection failed',
        milestones.inspection,
      ),
    );
  }
  if (hasSticker(workflow)) {
    timeline.push(
      add(
        TimelineEventType.STICKER_ISSUED,
        'Sticker issued',
        milestones.sticker,
      ),
    );
  }
  if (
    [
      'COMPLETED_WITH_CERTIFICATE',
      'DOCUMENTS_APPROVED_WAITING_CERTIFICATE',
    ].includes(workflow)
  ) {
    timeline.push(
      add(
        TimelineEventType.DOCUMENTS_APPROVED,
        'Documents approved',
        milestones.documents,
      ),
    );
  }
  if (
    ['CORRECTION_REQUIRED', 'CORRECTION_REPLACED_PENDING'].includes(workflow)
  ) {
    timeline.push(
      add(
        TimelineEventType.CORRECTION_REQUIRED,
        'Document correction required',
        milestones.documents,
      ),
    );
  }
  if (workflow === 'COMPLETED_WITH_CERTIFICATE') {
    timeline.push(
      add(
        TimelineEventType.APPLICATION_COMPLETED,
        'Application completed',
        milestones.completed,
      ),
    );
  }
  await events.save(timeline);
}

async function createCanonicalStatusHistory(
  manager: EntityManager,
  application: RenewalApplication,
  workflow: WorkflowScenario,
  milestones: WorkflowMilestones,
  admin: User,
): Promise<void> {
  if (workflow === 'DRAFT') return;
  const status = WORKFLOW_APPLICATION_STATUS[workflow];
  const previousStatus: Record<ApplicationStatus, ApplicationStatus | null> = {
    [ApplicationStatus.DRAFT]: null,
    [ApplicationStatus.SUBMITTED]: ApplicationStatus.DRAFT,
    [ApplicationStatus.UNDER_REVIEW]: ApplicationStatus.APPROVED,
    [ApplicationStatus.CORRECTION_REQUIRED]: ApplicationStatus.UNDER_REVIEW,
    [ApplicationStatus.APPROVED]: ApplicationStatus.SUBMITTED,
    [ApplicationStatus.REJECTED]: ApplicationStatus.UNDER_REVIEW,
    [ApplicationStatus.INSPECTION_FAILED]: ApplicationStatus.APPROVED,
    [ApplicationStatus.EXPIRED]: ApplicationStatus.SUBMITTED,
    [ApplicationStatus.CANCELLED]: ApplicationStatus.SUBMITTED,
    [ApplicationStatus.COMPLETED]: ApplicationStatus.APPROVED,
  };
  const occurredAt: Record<ApplicationStatus, Date> = {
    [ApplicationStatus.DRAFT]: milestones.submitted,
    [ApplicationStatus.SUBMITTED]: milestones.submitted,
    [ApplicationStatus.UNDER_REVIEW]: milestones.documents,
    [ApplicationStatus.CORRECTION_REQUIRED]: milestones.documents,
    [ApplicationStatus.APPROVED]: milestones.payment,
    [ApplicationStatus.REJECTED]: milestones.documents,
    [ApplicationStatus.INSPECTION_FAILED]: milestones.inspection,
    [ApplicationStatus.EXPIRED]: milestones.completed,
    [ApplicationStatus.CANCELLED]: milestones.documents,
    [ApplicationStatus.COMPLETED]: milestones.completed,
  };
  await manager.getRepository(RenewalApplicationStatusHistory).save(
    manager.getRepository(RenewalApplicationStatusHistory).create({
      applicationId: application.id,
      previousStatus: previousStatus[status],
      newStatus: status,
      changedByUserId: admin.id,
      reason: null,
      createdAt: occurredAt[status],
    }),
  );
}

function hasPassedInspection(scenario: WorkflowScenario): boolean {
  return hasInspection(scenario) && scenario !== 'PRIMARY_FAIL_TERMINAL';
}

function hasSticker(scenario: WorkflowScenario): boolean {
  return [
    'STICKER_ISSUED_WAITING_DOCUMENT_REVIEW',
    'DOCUMENTS_UNDER_REVIEW',
    'DOCUMENTS_APPROVED_WAITING_CERTIFICATE',
    'CORRECTION_REQUIRED',
    'CORRECTION_REPLACED_PENDING',
    'REJECTED',
    'COMPLETED_WITH_CERTIFICATE',
  ].includes(scenario);
}

const CORRECTION_REQUIRED_DOCUMENT_REJECTION_REASON =
  'The previous inspection certificate scan is not sufficiently clear.';
const DOCUMENT_IMAGE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAYAAADlNHIOAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFKSURBVHhe7dexbQJBGAVh6nFMZa7IMUXQmp2uDgad2WNWgvmkP9nwTbSn3yx12j7EVYDFCrDYTYCv83f34hsVYMGNCrDgRg8D5Di0awEktGsBJLRrASS0awEktGsBJLRrASS0awEktGsBJLRrASS0awEktGsBJLRrASS0awEktOtUgJ/Ltbtct7PcRbsW4IDbg3adCpD9aNcCSGjXAkho1wJIaNcCSGjXAkho1wJIaNcCSGjXqQDbD8k73dFo1wLAHY12nQqQ/WjXAkho1wJIaNcCSGjXAkho1wJIaNcCSGjXAkho16kA28/LJ9yzaNcC/POeRbtOBch+tGsBJLRrASS0awEktGsBJLRrASS0awEktGsBJLRrASS0awEktGsBJLRrASS0awEktGsBJLRrASS068MA3WtuVIAFNyrAghvdBIirAIsVYLE/WjslFrW6baYAAAAASUVORK5CYII=',
  'base64',
);

function documentStatus(
  scenario: WorkflowScenario,
  documentType: DocumentType,
): DocumentStatus {
  if (scenario === 'CORRECTION_REQUIRED') {
    return documentType === DocumentType.PREVIOUS_INSPECTION_CERTIFICATE
      ? DocumentStatus.REJECTED
      : documentType === DocumentType.VEHICLE_REGISTRATION_CARD
        ? DocumentStatus.APPROVED
        : DocumentStatus.PENDING;
  }
  if (scenario === 'CORRECTION_REPLACED_PENDING') {
    return documentType === DocumentType.PREVIOUS_INSPECTION_CERTIFICATE
      ? DocumentStatus.PENDING
      : DocumentStatus.APPROVED;
  }
  if (scenario === 'REJECTED') {
    return documentType === DocumentType.PREVIOUS_INSPECTION_CERTIFICATE
      ? DocumentStatus.REJECTED
      : DocumentStatus.APPROVED;
  }
  if (
    [
      'COMPLETED_WITH_CERTIFICATE',
      'DOCUMENTS_APPROVED_WAITING_CERTIFICATE',
    ].includes(scenario)
  ) {
    return DocumentStatus.APPROVED;
  }
  return DocumentStatus.PENDING;
}

function inspectionValidityRule(
  categoryCode: RealisticVehicleFixture['categoryCode'],
): InspectionValidityRule {
  if (categoryCode === 'MPWT0011524') {
    return InspectionValidityRule.NEW_FAMILY_VEHICLE;
  }
  if (categoryCode === 'MPWT0011525') {
    return InspectionValidityRule.FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL;
  }
  return InspectionValidityRule.FAMILY_VEHICLE_5_TO_9_PERSONS_NON_COMMERCIAL_RENEWAL;
}

function feeAmounts(
  fixture: RealisticVehicleFixture,
  expiryDate: string,
  today: string,
  inspectionFeeKhr: string,
) {
  const lateDays = Math.max(
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${expiryDate}T00:00:00Z`)) /
        86_400_000,
    ),
    0,
  );
  const chargeable = chargeableLateDays(
    lateDays,
    expiryDate,
    inspectionPolicy.latePenalty,
  );
  const serviceFee = fixture.optionalServiceSelected
    ? Number(OPTIONAL_OVERSIZE_SERVICE_FEE_KHR)
    : 0;
  const inspectionFee = Number(inspectionFeeKhr);
  const lateFee = chargeable * inspectionPolicy.latePenalty.lightRateKhrPerDay;
  return {
    lateDays,
    inspectionFeeKhr: inspectionFee.toFixed(2),
    serviceFeeKhr: serviceFee.toFixed(2),
    baseAmount: (inspectionFee + serviceFee).toFixed(2),
    lateFee: lateFee.toFixed(2),
    totalAmount: (inspectionFee + serviceFee + lateFee).toFixed(2),
  };
}

async function createActors(manager: EntityManager) {
  const passwordHash = await argon2.hash(PASSWORD, AUTH_ARGON2ID_OPTIONS);
  const users = manager.getRepository(User);
  const now = new Date();
  const admin = await users.save(
    users.create({
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      email: 'admin@gmail.com',
      phone: '01111111',
      passwordHash,
      phoneVerifiedAt: null,
      emailVerifiedAt: now,
      lastLoginAt: null,
    }),
  );
  const citizens = await users.save([
    users.create({
      role: UserRole.CITIZEN,
      status: UserStatus.ACTIVE,
      email: 'citizen1@gmail.com',
      phone: '+85512345678',
      passwordHash,
      phoneVerifiedAt: now,
      emailVerifiedAt: now,
      lastLoginAt: null,
    }),
    users.create({
      role: UserRole.CITIZEN,
      status: UserStatus.ACTIVE,
      email: 'citizen2@gmail.com',
      phone: '+85512345679',
      passwordHash,
      phoneVerifiedAt: now,
      emailVerifiedAt: now,
      lastLoginAt: null,
    }),
  ]);
  const profiles = manager.getRepository(CitizenProfile);
  await profiles.save([
    profiles.create({
      userId: citizens[0].id,
      nameKh: 'សុខ ដារ៉ា',
      nameEn: 'Sok Dara',
      nationalIdNumber: '010923184765',
      address:
        'Sangkat Boeung Keng Kang Ti Muoy, Khan Boeung Keng Kang, Phnom Penh',
      profileImageKey: null,
    }),
    profiles.create({
      userId: citizens[1].id,
      nameKh: 'លី សុភា',
      nameEn: 'Ly Sophea',
      nationalIdNumber: '020817593426',
      address: 'Sangkat Ta Khmau, Krong Ta Khmau, Kandal',
      profileImageKey: null,
    }),
  ]);
  return { admin, citizens };
}

async function createVehicle(
  manager: EntityManager,
  fixture: RealisticVehicleFixture,
  index: number,
  citizen: User,
  admin: User,
  category: InspectionVehicleCategory,
  today: string,
): Promise<Vehicle> {
  const expiryDate = addDays(today, fixture.expiryOffsetDays);
  const firstRegistrationDate =
    fixture.categoryCode === 'MPWT0011524'
      ? addYears(expiryDate, -4)
      : `${fixture.year}-${String((index % 9) + 1).padStart(2, '0')}-${String((index % 20) + 4).padStart(2, '0')}`;
  const lastInspectionDate =
    fixture.scenario === 'NO_APP_VALID' &&
    fixture.categoryCode === 'MPWT0011524'
      ? addYears(expiryDate, -4)
      : fixture.categoryCode === 'MPWT0011524'
        ? null
        : addYears(expiryDate, -2);
  const owner =
    fixture.owner === 1
      ? { kh: 'សុខ ដារ៉ា', en: 'Sok Dara', phone: '012345678' }
      : { kh: 'លី សុភា', en: 'Ly Sophea', phone: '012345679' };
  const code = String(index + 1).padStart(7, '0');
  const vehicles = manager.getRepository(Vehicle);
  return vehicles.save(
    vehicles.create({
      linkedCitizenId: citizen.id,
      registrationNumber: fixture.registrationNumber,
      plateNumber: fixture.plateNumber,
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: fixture.plateProvince,
      plateType: 'PRIVATE',
      vehicleType: 'FAMILY_PASSENGER',
      colour: fixture.colour,
      engineNumber: `${fixture.make.slice(0, 3).toUpperCase()}${fixture.year}${code}`,
      numberOfCylinders: fixture.engineCc > 3000 ? 6 : 4,
      engineDisplacementCc: fixture.engineCc,
      enginePowerHp: fixture.powerHp.toFixed(2),
      fuelType: fixture.fuelType,
      numberOfSeats: fixture.seats,
      numberOfAxles: 2,
      steering: 'LEFT',
      vehicleWeightKg: fixture.weightKg,
      maximumLoadKg: fixture.maximumLoadKg,
      maximumGrossWeightKg: fixture.maximumGrossWeightKg,
      wheelSize: fixture.wheelSize,
      lengthMm: fixture.lengthMm,
      widthMm: fixture.widthMm,
      heightMm: fixture.heightMm,
      vehicleClass: VehicleClass.LIGHT,
      inspectionCategoryId: category.id,
      classificationVerifiedAt: timestampDaysAgo(60),
      classificationVerifiedBy: admin.id,
      make: fixture.make,
      model: fixture.model,
      manufactureYear: fixture.year,
      chassisNumber: `RLVPSV${fixture.year}${code}`,
      firstRegistrationDate,
      lastInspectionDate,
      inspectionExpiryDate: expiryDate,
      registeredOwnerNameKh: owner.kh,
      registeredOwnerNameEn: owner.en,
      registeredOwnerPhone: owner.phone,
      isActive: true,
    }),
  );
}

async function createDocuments(
  manager: EntityManager,
  files: FilesService,
  application: RenewalApplication,
  citizen: User,
  admin: User,
  scenario: WorkflowScenario,
  milestones: WorkflowMilestones,
): Promise<void> {
  if (scenario === 'DRAFT') return;
  for (const documentType of Object.values(DocumentType)) {
    const status = documentStatus(scenario, documentType);
    let replacesDocumentId: string | null = null;
    let versionNumber = 1;
    const correctionImage =
      documentType === DocumentType.PREVIOUS_INSPECTION_CERTIFICATE &&
      ['CORRECTION_REQUIRED', 'CORRECTION_REPLACED_PENDING'].includes(scenario);
    if (scenario === 'CORRECTION_REPLACED_PENDING' && correctionImage) {
      const originalStored = await files.saveApplicationDocument(
        application.id,
        DOCUMENT_IMAGE_PNG,
        'png',
      );
      const original = await manager.getRepository(ApplicationDocument).save(
        manager.getRepository(ApplicationDocument).create({
          applicationId: application.id,
          documentType,
          versionNumber: 1,
          isCurrent: false,
          replacesDocumentId: null,
          uploadedByUserId: citizen.id,
          storageKey: originalStored.storageKey,
          originalFileName: 'previous-inspection-certificate-v1.png',
          mimeType: 'image/png',
          fileSizeBytes: String(DOCUMENT_IMAGE_PNG.length),
          status: DocumentStatus.REJECTED,
          reviewedByUserId: admin.id,
          reviewedAt: milestones.documents,
          rejectionReason: CORRECTION_REQUIRED_DOCUMENT_REJECTION_REASON,
          uploadedAt: milestones.submitted,
        }),
      );
      replacesDocumentId = original.id;
      versionNumber = 2;
    }
    const stored = await files.saveApplicationDocument(
      application.id,
      correctionImage
        ? DOCUMENT_IMAGE_PNG
        : Buffer.from('%PDF-1.4\n% MPWT development fixture document\n%%EOF\n'),
      correctionImage ? 'png' : 'pdf',
    );
    await manager.getRepository(ApplicationDocument).save(
      manager.getRepository(ApplicationDocument).create({
        applicationId: application.id,
        documentType,
        versionNumber,
        isCurrent: true,
        replacesDocumentId,
        uploadedByUserId: citizen.id,
        storageKey: stored.storageKey,
        originalFileName: correctionImage
          ? `previous-inspection-certificate-v${versionNumber}.png`
          : `${documentType.toLowerCase().replaceAll('_', '-')}.pdf`,
        mimeType: correctionImage ? 'image/png' : 'application/pdf',
        fileSizeBytes: correctionImage
          ? String(DOCUMENT_IMAGE_PNG.length)
          : '49',
        status,
        reviewedByUserId: status === DocumentStatus.PENDING ? null : admin.id,
        reviewedAt:
          status === DocumentStatus.PENDING ? null : milestones.documents,
        rejectionReason:
          status === DocumentStatus.REJECTED
            ? scenario === 'CORRECTION_REQUIRED'
              ? CORRECTION_REQUIRED_DOCUMENT_REJECTION_REASON
              : 'The uploaded scan is not sufficiently clear.'
            : null,
        uploadedAt: milestones.submitted,
      }),
    );
  }
}

async function createPayment(
  manager: EntityManager,
  files: FilesService,
  pdf: PaymentPdfService,
  application: RenewalApplication,
  vehicle: Vehicle,
  fixture: RealisticVehicleFixture,
  workflow: WorkflowScenario,
  admin: User,
  category: InspectionVehicleCategory,
  today: string,
  index: number,
  milestones: WorkflowMilestones,
): Promise<void> {
  if (workflow === 'DRAFT') return;
  const status = paymentStatus(workflow);
  const amounts = feeAmounts(
    fixture,
    vehicle.inspectionExpiryDate,
    today,
    category.inspectionFeeKhr,
  );
  const invoiceNumber = generateInvoiceNumber(today, () => 1400 + index);
  const invoice = await pdf.generateInvoice({
    invoiceNumber,
    issuedDate: today,
    applicationReferenceNumber: application.referenceNumber,
    vehiclePlate: vehicle.plateNumber,
    vehicleMakeModel: `${vehicle.make} ${vehicle.model}`,
    previousInspectionExpiryDate: vehicle.inspectionExpiryDate,
    ...amounts,
    currency: 'KHR',
  });
  const storedInvoice = await files.savePaymentArtifact(
    application.id,
    'invoice',
    invoice,
  );
  const confirmed = status === PaymentStatus.CONFIRMED;
  const receiptNumber = confirmed
    ? generateReceiptNumber(today, () => 1400 + index)
    : null;
  let receiptFileKey: string | null = null;
  let inspectionSheetFileKey: string | null = null;
  if (confirmed && receiptNumber !== null) {
    const [receipt, inspectionSheet] = await Promise.all([
      pdf.generateReceipt({
        receiptNumber,
        invoiceNumber,
        confirmedDate: today,
        applicationReferenceNumber: application.referenceNumber as string,
        vehiclePlate: vehicle.plateNumber,
        vehicleMakeModel: `${vehicle.make} ${vehicle.model}`,
        ...amounts,
        currency: 'KHR',
        paymentReference: null,
      }),
      pdf.generateInspectionSheet({
        invoiceNumber,
        applicationReferenceNumber: application.referenceNumber as string,
        vehiclePlate: vehicle.plateNumber,
        vehicleMakeModel: `${vehicle.make} ${vehicle.model}`,
        vehicleClass: VehicleClass.LIGHT,
        inspectionCategory: category.code,
      }),
    ]);
    receiptFileKey = (
      await files.savePaymentArtifact(application.id, 'receipt', receipt)
    ).storageKey;
    inspectionSheetFileKey = (
      await files.savePaymentArtifact(
        application.id,
        'inspection-sheet',
        inspectionSheet,
      )
    ).storageKey;
  }
  await manager.getRepository(Payment).save(
    manager.getRepository(Payment).create({
      applicationId: application.id,
      invoiceNumber,
      receiptNumber,
      method: PaymentMethod.PAY_AT_STATION,
      status,
      ...amounts,
      currency: 'KHR',
      paymentReference: null,
      providerName: null,
      providerTransactionId: null,
      confirmedByUserId: confirmed ? admin.id : null,
      confirmedAt: confirmed ? milestones.payment : null,
      failedAt: null,
      failureReason: null,
      rejectedAt: status === PaymentStatus.REJECTED ? milestones.payment : null,
      rejectedByUserId: status === PaymentStatus.REJECTED ? admin.id : null,
      rejectionReason:
        status === PaymentStatus.REJECTED
          ? 'The station could not confirm the submitted payment evidence.'
          : null,
      invoiceIssuedAt: milestones.submitted,
      invoiceFileKey: storedInvoice.storageKey,
      receiptFileKey,
      previousInspectionExpiryDate: vehicle.inspectionExpiryDate,
      inspectionSheetFileKey,
    }),
  );
}

async function createInspectionArtifacts(
  manager: EntityManager,
  files: FilesService,
  certificatePdf: CertificatePdfService,
  application: RenewalApplication,
  vehicle: Vehicle,
  fixture: RealisticVehicleFixture,
  workflow: WorkflowScenario,
  admin: User,
  station: InspectionStation,
  category: InspectionVehicleCategory,
  milestones: WorkflowMilestones,
  applicationSequence: number,
): Promise<void> {
  if (!hasInspection(workflow)) return;
  const passed = hasPassedInspection(workflow);
  const completedAt = milestones.inspection;
  const validUntil = passed ? vehicle.inspectionExpiryDate : null;
  const inspections = manager.getRepository(Inspection);
  const inspection = await inspections.save(
    inspections.create({
      applicationId: application.id,
      appointmentId: null,
      actualStationId: station.id,
      attemptNumber: 1,
      status: InspectionStatus.COMPLETED,
      result: passed ? InspectionResult.PASS : InspectionResult.FAIL,
      recordedByUserId: admin.id,
      startedAt: addMinutes(completedAt, -15),
      completedAt,
      validUntil,
      validityRule: passed
        ? inspectionValidityRule(fixture.categoryCode)
        : null,
      failureReason: passed
        ? null
        : 'The left front service brake efficiency is below the permitted threshold.',
      notes: passed ? 'Inspection completed without adverse findings.' : null,
    }),
  );
  if (!hasSticker(workflow)) return;
  await manager.getRepository(Sticker).save(
    manager.getRepository(Sticker).create({
      applicationId: application.id,
      inspectionId: inspection.id,
      stickerNumber: `STK-${String(applicationSequence).padStart(4, '0')}`,
      issuedAt: milestones.sticker,
      issuedByUserId: admin.id,
    }),
  );
  if (workflow !== 'COMPLETED_WITH_CERTIFICATE') return;
  const certificateNumber = generateCertificateNumber();
  const issuedAt = milestones.completed;
  const certificateBuffer = await certificatePdf.generate({
    certificate: { certificateNumber, issuedAt },
    inspection: { completedAt, validUntil: validUntil as string },
    vehicle: {
      make: vehicle.make,
      model: vehicle.model,
      plateProvince: vehicle.plateProvince ?? '',
      plateNumber: vehicle.plateNumber,
      manufactureYear: vehicle.manufactureYear,
      vehicleType: vehicle.vehicleType,
      colour: vehicle.colour,
      engineNumber: vehicle.engineNumber,
      chassisNumber: vehicle.chassisNumber,
      numberOfCylinders: vehicle.numberOfCylinders,
      engineDisplacementCc: vehicle.engineDisplacementCc,
      enginePowerHp: vehicle.enginePowerHp,
      fuelType: vehicle.fuelType,
      numberOfSeats: vehicle.numberOfSeats,
      numberOfAxles: vehicle.numberOfAxles,
      steering: vehicle.steering,
      vehicleWeightKg: vehicle.vehicleWeightKg,
      maximumLoadKg: vehicle.maximumLoadKg,
      maximumGrossWeightKg: vehicle.maximumGrossWeightKg,
      wheelSize: vehicle.wheelSize,
      lengthMm: vehicle.lengthMm,
      widthMm: vehicle.widthMm,
      heightMm: vehicle.heightMm,
    },
    note: null,
  });
  const stored = await files.saveCertificateArtifact(
    application.id,
    certificateBuffer,
  );
  await manager.getRepository(TechnicalInspectionCertificate).save(
    manager.getRepository(TechnicalInspectionCertificate).create({
      applicationId: application.id,
      inspectionId: inspection.id,
      certificateNumber,
      issuedAt,
      issuedByUserId: admin.id,
      artifactFileKey: stored.storageKey,
    }),
  );
}

export async function seedRealisticDevelopmentDataset(
  dataSource: DataSource,
): Promise<RealisticSeedCounts> {
  const paymentPdf = new PaymentPdfService();
  const certificatePdf = new CertificatePdfService(
    new ConfigService({ ...process.env }),
  );
  const files = new FilesService(
    new ConfigService({
      ...process.env,
      PRIVATE_STORAGE_ROOT:
        process.env.PRIVATE_STORAGE_ROOT ?? 'storage/private',
    }),
  );
  try {
    return await dataSource.transaction(async (manager) => {
      const [clock] = await manager.query<Array<{ today: string }>>(
        `SELECT (now() AT TIME ZONE 'Asia/Phnom_Penh')::date::text AS "today"`,
      );
      if (clock === undefined)
        throw new Error('Cambodia-local clock unavailable.');
      const categories = await manager
        .getRepository(InspectionVehicleCategory)
        .find({
          where: REALISTIC_VEHICLES.map(({ categoryCode }) => ({
            code: categoryCode,
          })),
        });
      const categoryByCode = new Map(
        categories.map((category) => [category.code, category]),
      );
      for (const code of ['MPWT0011524', 'MPWT0011525', 'MPWT0011526']) {
        if (!categoryByCode.has(code)) {
          throw new Error(
            `Required inspection category ${code} is not seeded.`,
          );
        }
      }
      const station = await manager.getRepository(InspectionStation).findOne({
        where: { isActive: true },
        order: { code: 'ASC' },
      });
      if (station === null)
        throw new Error('At least one active inspection station is required.');
      const { admin, citizens } = await createActors(manager);
      for (const [index, fixture] of REALISTIC_VEHICLES.entries()) {
        const citizen = citizens[fixture.owner - 1];
        const category = categoryByCode.get(
          fixture.categoryCode,
        ) as InspectionVehicleCategory;
        const vehicle = await createVehicle(
          manager,
          fixture,
          index,
          citizen,
          admin,
          category,
          clock.today,
        );
        for (const [cycleIndex, workflow] of fixture.workflows.entries()) {
          const draft = workflow === 'DRAFT';
          const milestones = workflowMilestones(workflow, vehicle, category);
          const submittedAt = draft ? null : milestones.submitted;
          const status = WORKFLOW_APPLICATION_STATUS[workflow];
          const applicationSequence = index * 2 + cycleIndex + 1;
          const application = await manager
            .getRepository(RenewalApplication)
            .save(
              manager.getRepository(RenewalApplication).create({
                id: randomUUID(),
                referenceNumber: draft
                  ? null
                  : seededApplicationReference(
                      submittedAt as Date,
                      applicationSequence,
                    ),
                citizenId: citizen.id,
                vehicleId: vehicle.id,
                status,
                applicantSnapshot: draft
                  ? null
                  : {
                      userId: citizen.id,
                      nameKh: fixture.owner === 1 ? 'សុខ ដារ៉ា' : 'លី សុភា',
                      nameEn: fixture.owner === 1 ? 'Sok Dara' : 'Ly Sophea',
                      nationalIdNumber:
                        fixture.owner === 1 ? '010923184765' : '020817593426',
                      phone: citizen.phone,
                      email: citizen.email,
                      address:
                        fixture.owner === 1
                          ? 'Sangkat Boeung Keng Kang Ti Muoy, Phnom Penh'
                          : 'Sangkat Ta Khmau, Krong Ta Khmau, Kandal',
                    },
                vehicleSnapshot: draft
                  ? null
                  : createApplicationVehicleSnapshot(vehicle),
                currentCorrectionReason: [
                  'CORRECTION_REQUIRED',
                  'CORRECTION_REPLACED_PENDING',
                ].includes(workflow)
                  ? CORRECTION_REQUIRED_DOCUMENT_REJECTION_REASON
                  : null,
                currentRejectionReason:
                  workflow === 'REJECTED'
                    ? 'The submitted registration information could not be verified.'
                    : null,
                preferredInspectionStationId: draft ? null : station.id,
                preferredInspectionDate: draft ? null : addDays(clock.today, 5),
                optionalOversizeServiceSelected:
                  fixture.optionalServiceSelected,
                submittedAt,
                reviewStartedAt: [
                  'DOCUMENTS_UNDER_REVIEW',
                  'CORRECTION_REQUIRED',
                  'CORRECTION_REPLACED_PENDING',
                  'REJECTED',
                  'COMPLETED_WITH_CERTIFICATE',
                  'DOCUMENTS_APPROVED_WAITING_CERTIFICATE',
                ].includes(workflow)
                  ? milestones.documents
                  : null,
                readyForInspectionAt:
                  paymentStatus(workflow) === PaymentStatus.CONFIRMED
                    ? milestones.payment
                    : null,
                completedAt:
                  workflow === 'COMPLETED_WITH_CERTIFICATE'
                    ? milestones.completed
                    : null,
                cancelledAt:
                  workflow === 'CANCELLED' ? milestones.documents : null,
                cancelledByUserId: workflow === 'CANCELLED' ? citizen.id : null,
                cancellationReason:
                  workflow === 'CANCELLED'
                    ? 'Citizen cancelled the renewal request.'
                    : null,
              }),
            );
          await createCanonicalStatusHistory(
            manager,
            application,
            workflow,
            milestones,
            admin,
          );
          await createDocuments(
            manager,
            files,
            application,
            citizen,
            admin,
            workflow,
            milestones,
          );
          await createPayment(
            manager,
            files,
            paymentPdf,
            application,
            vehicle,
            fixture,
            workflow,
            admin,
            category,
            clock.today,
            applicationSequence,
            milestones,
          );
          await createInspectionArtifacts(
            manager,
            files,
            certificatePdf,
            application,
            vehicle,
            fixture,
            workflow,
            admin,
            station,
            category,
            milestones,
            applicationSequence,
          );
          await createCanonicalWorkflowTimeline(
            manager,
            application,
            workflow,
            milestones,
            admin,
          );
        }
      }
      return verifyRealisticDevelopmentDataset(manager);
    });
  } finally {
    await Promise.all([
      paymentPdf.onModuleDestroy(),
      certificatePdf.onModuleDestroy(),
    ]);
  }
}

export async function verifyRealisticDevelopmentDataset(
  manager: EntityManager,
): Promise<RealisticSeedCounts> {
  const [counts] = await manager.query<RealisticSeedCounts[]>(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS "users",
      (SELECT COUNT(*)::int FROM users WHERE role = 'ADMIN') AS "administrators",
      (SELECT COUNT(*)::int FROM users WHERE role = 'CITIZEN') AS "citizens",
      (SELECT COUNT(*)::int FROM vehicles) AS "vehicles",
      (SELECT COUNT(*)::int FROM vehicles v JOIN users u ON u.id = v.linked_citizen_id WHERE u.email = 'citizen1@gmail.com') AS "citizenOneVehicles",
      (SELECT COUNT(*)::int FROM vehicles v JOIN users u ON u.id = v.linked_citizen_id WHERE u.email = 'citizen2@gmail.com') AS "citizenTwoVehicles",
      (SELECT COUNT(*)::int FROM renewal_applications) AS "applications",
      (SELECT COUNT(*)::int FROM inspections) AS "inspections",
      (SELECT COUNT(*)::int FROM stickers) AS "stickers",
      (SELECT COUNT(*)::int FROM technical_inspection_certificates) AS "certificates",
      (SELECT COUNT(*)::int FROM vehicles v JOIN inspection_vehicle_categories c ON c.id = v.inspection_category_id WHERE c.code IN ('MPWT0011524','MPWT0011525','MPWT0011526') AND v.maximum_gross_weight_kg > 3500) AS "optionalEligibleVehicles",
      (SELECT COUNT(*)::int FROM renewal_applications WHERE optional_oversize_service_selected) AS "optionalSelectedApplications"
  `);
  if (counts === undefined)
    throw new Error('Seed verification did not return counts.');
  const required: Partial<RealisticSeedCounts> = {
    users: 3,
    administrators: 1,
    citizens: 2,
    vehicles: 34,
    citizenOneVehicles: 17,
    citizenTwoVehicles: 17,
    applications: 33,
    certificates: 8,
  };
  for (const [key, expected] of Object.entries(required)) {
    if (counts[key as keyof RealisticSeedCounts] !== expected) {
      throw new Error(
        `Seed verification failed for ${key}: expected ${expected}.`,
      );
    }
  }
  const [integrity] = await manager.query<
    Array<{
      invalidCategoryCount: number;
      majorityCount: number;
      invalidAttemptCount: number;
      invalidCertificateCount: number;
      oldSyntheticCount: number;
      invalidCorrectionRequiredDocuments: number;
      invalidInspectionFailedFixture: number;
    }>
  >(`
    SELECT
      (SELECT COUNT(*)::int FROM vehicles v JOIN inspection_vehicle_categories c ON c.id = v.inspection_category_id WHERE c.code NOT IN ('MPWT0011524','MPWT0011525','MPWT0011526') OR v.vehicle_class <> 'LIGHT') AS "invalidCategoryCount",
      (SELECT COUNT(*)::int FROM vehicles v JOIN inspection_vehicle_categories c ON c.id = v.inspection_category_id WHERE c.code = 'MPWT0011526') AS "majorityCount",
      (SELECT COUNT(*)::int FROM inspections WHERE attempt_number > 1) AS "invalidAttemptCount",
      (SELECT COUNT(*)::int FROM technical_inspection_certificates WHERE certificate_number !~ '^[0-9]{13}$') AS "invalidCertificateCount",
      (SELECT COUNT(*)::int FROM inspection_vehicle_categories WHERE code IN ('LOCAL-DEMO-LIGHT','LOCAL-DEMO-HEAVY')) AS "oldSyntheticCount",
      (SELECT COUNT(*)::int FROM renewal_applications a
        WHERE a.status = 'CORRECTION_REQUIRED' AND (
          NOT EXISTS (
            SELECT 1 FROM application_documents d
            WHERE d.application_id = a.id
              AND d.status = 'REJECTED'
              AND NULLIF(BTRIM(d.rejection_reason), '') IS NOT NULL
          )
        )
      ) AS "invalidCorrectionRequiredDocuments",
      (SELECT CASE WHEN
        (SELECT COUNT(*) FROM renewal_applications failed
          JOIN vehicles v ON v.id = failed.vehicle_id
          JOIN users u ON u.id = failed.citizen_id
          WHERE u.email = 'citizen1@gmail.com' AND v.plate_number = '2AA-1011'
            AND failed.status = 'INSPECTION_FAILED') = 1
        AND EXISTS (
          SELECT 1 FROM renewal_applications failed
          JOIN vehicles v ON v.id = failed.vehicle_id
          JOIN inspections i ON i.application_id = failed.id
          JOIN payments p ON p.application_id = failed.id
          WHERE v.plate_number = '2AA-1011' AND failed.status = 'INSPECTION_FAILED'
            AND i.status = 'COMPLETED' AND i.result = 'FAIL' AND i.attempt_number = 1
            AND NULLIF(BTRIM(i.failure_reason), '') IS NOT NULL AND i.valid_until IS NULL
            AND p.status = 'CONFIRMED' AND failed.submitted_at < p.confirmed_at
            AND p.confirmed_at < i.completed_at
            AND NOT EXISTS (SELECT 1 FROM inspections second_attempt WHERE second_attempt.application_id = failed.id AND second_attempt.attempt_number > 1)
            AND NOT EXISTS (SELECT 1 FROM stickers s WHERE s.application_id = failed.id)
            AND NOT EXISTS (SELECT 1 FROM technical_inspection_certificates c WHERE c.application_id = failed.id)
        )
        THEN 0 ELSE 1 END::int) AS "invalidInspectionFailedFixture"
  `);
  if (
    integrity === undefined ||
    integrity.invalidCategoryCount !== 0 ||
    integrity.majorityCount < 24 ||
    integrity.invalidAttemptCount !== 0 ||
    integrity.invalidCertificateCount !== 0 ||
    integrity.oldSyntheticCount !== 0 ||
    integrity.invalidCorrectionRequiredDocuments !== 0 ||
    integrity.invalidInspectionFailedFixture !== 0
  ) {
    throw new Error(
      `Seed integrity verification failed: ${JSON.stringify(integrity)}.`,
    );
  }
  return counts;
}

function assertStandaloneSafety(): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('This seed may only run with NODE_ENV=development.');
  }
  if (process.env.ALLOW_REALISTIC_DEVELOPMENT_SEED !== 'true') {
    throw new Error(
      'Set ALLOW_REALISTIC_DEVELOPMENT_SEED=true to run this seed.',
    );
  }
}

async function main(): Promise<void> {
  assertStandaloneSafety();
  const dataSource = (
    requireFromScript('../src/database/data-source') as { default: DataSource }
  ).default;
  await dataSource.initialize();
  try {
    const [existing] = await dataSource.query<Array<{ count: number }>>(
      'SELECT ((SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM vehicles))::int AS count',
    );
    if ((existing?.count ?? 0) !== 0) {
      throw new Error(
        'The standalone seed requires an empty users/vehicles dataset. Run reset:local-development.',
      );
    }
    console.log(
      JSON.stringify(
        await seedRealisticDevelopmentDataset(dataSource),
        null,
        2,
      ),
    );
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      `Realistic development seed aborted: ${error instanceof Error ? error.message : 'Unknown error.'}`,
    );
    process.exitCode = 1;
  });
}
