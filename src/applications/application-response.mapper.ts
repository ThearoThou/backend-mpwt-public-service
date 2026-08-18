import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';

export interface RenewalApplicationResponse {
  id: string;
  referenceNumber: string | null;
  citizenId: string;
  vehicleId: string;
  status: ApplicationStatus;
  currentCorrectionReason: string | null;
  currentRejectionReason: string | null;
  preferredInspectionStationId: string | null;
  preferredInspectionDate: string | null;
  submittedAt: Date | null;
  reviewStartedAt: Date | null;
  readyForInspectionAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function mapRenewalApplication(
  application: RenewalApplication,
): RenewalApplicationResponse {
  return {
    id: application.id,
    referenceNumber: application.referenceNumber,
    citizenId: application.citizenId,
    vehicleId: application.vehicleId,
    status: application.status,
    currentCorrectionReason: application.currentCorrectionReason,
    currentRejectionReason: application.currentRejectionReason,
    preferredInspectionStationId: application.preferredInspectionStationId,
    preferredInspectionDate: application.preferredInspectionDate,
    submittedAt: application.submittedAt,
    reviewStartedAt: application.reviewStartedAt,
    readyForInspectionAt: application.readyForInspectionAt,
    completedAt: application.completedAt,
    cancelledAt: application.cancelledAt,
    cancellationReason: application.cancellationReason,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}
