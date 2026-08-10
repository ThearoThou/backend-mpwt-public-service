import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';

type ApplicationSnapshot = Record<string, unknown> | null;

export interface AdminApplicationQueueResponse {
  id: string;
  referenceNumber: string | null;
  citizenId: string;
  vehicleId: string;
  status: ApplicationStatus;
  applicantNameKh: string | null;
  applicantNameEn: string | null;
  nationalIdNumber: string | null;
  plateNumber: string | null;
  registrationNumber: string | null;
  submittedAt: Date | null;
  reviewStartedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminApplicationDetailResponse {
  id: string;
  referenceNumber: string | null;
  citizenId: string;
  vehicleId: string;
  status: ApplicationStatus;
  currentCorrectionReason: string | null;
  currentRejectionReason: string | null;
  submittedAt: Date | null;
  reviewStartedAt: Date | null;
  readyForInspectionAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  applicantSnapshot: ApplicationSnapshot;
  vehicleSnapshot: ApplicationSnapshot;
}

function snapshotString(
  snapshot: ApplicationSnapshot,
  key: string,
): string | null {
  const value = snapshot?.[key];
  return typeof value === 'string' ? value : null;
}

export function mapAdminApplicationQueue(
  application: RenewalApplication,
): AdminApplicationQueueResponse {
  return {
    id: application.id,
    referenceNumber: application.referenceNumber,
    citizenId: application.citizenId,
    vehicleId: application.vehicleId,
    status: application.status,
    applicantNameKh: snapshotString(application.applicantSnapshot, 'nameKh'),
    applicantNameEn: snapshotString(application.applicantSnapshot, 'nameEn'),
    nationalIdNumber: snapshotString(
      application.applicantSnapshot,
      'nationalIdNumber',
    ),
    plateNumber: snapshotString(application.vehicleSnapshot, 'plateNumber'),
    registrationNumber: snapshotString(
      application.vehicleSnapshot,
      'registrationNumber',
    ),
    submittedAt: application.submittedAt,
    reviewStartedAt: application.reviewStartedAt,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

export function mapAdminApplicationDetail(
  application: RenewalApplication,
): AdminApplicationDetailResponse {
  return {
    id: application.id,
    referenceNumber: application.referenceNumber,
    citizenId: application.citizenId,
    vehicleId: application.vehicleId,
    status: application.status,
    currentCorrectionReason: application.currentCorrectionReason,
    currentRejectionReason: application.currentRejectionReason,
    submittedAt: application.submittedAt,
    reviewStartedAt: application.reviewStartedAt,
    readyForInspectionAt: application.readyForInspectionAt,
    completedAt: application.completedAt,
    cancelledAt: application.cancelledAt,
    cancellationReason: application.cancellationReason,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    applicantSnapshot: application.applicantSnapshot,
    vehicleSnapshot: application.vehicleSnapshot,
  };
}
