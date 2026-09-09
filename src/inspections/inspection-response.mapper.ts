import { ApplicationStatus } from '../applications/enums/application-status.enum';
import type { AdminApplicationDocumentResponse } from '../applications/admin-application-document-response.mapper';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { InspectionResult } from './enums/inspection-result.enum';
import { InspectionValidityRule } from './enums/inspection-validity-rule.enum';
import type { AdminInspectionQueueView } from './dto/inspection-query.dtos';

export interface InspectionSummaryResponse {
  id: string;
  attemptNumber: number;
  result: InspectionResult;
  inspectedAt: Date;
  failureReason: string | null;
  validUntil: string | null;
  validityRule: InspectionValidityRule | null;
}

export interface AdminInspectionQueueResponse {
  applicationId: string;
  referenceNumber: string | null;
  appointmentId: string;
  capacityDate: string;
  queueView: AdminInspectionQueueView;
  attemptNumber: number;
  station: { id: string; code: string; nameKh: string; nameEn: string };
  vehicle: {
    registrationNumber: string | null;
    plateNumber: string | null;
    make: string | null;
    model: string | null;
  };
  inspection: InspectionSummaryResponse | null;
}

export interface AdminInspectionDetailResponse {
  application: {
    id: string;
    referenceNumber: string | null;
    status: ApplicationStatus;
  };
  appointment: { id: string; status: AppointmentStatus; capacityDate: string };
  station: {
    id: string;
    code: string;
    nameKh: string;
    nameEn: string;
    province: string;
    address: string;
    phone: string | null;
  };
  vehicle: AdminInspectionQueueResponse['vehicle'];
  documents: AdminApplicationDocumentResponse[];
  payment: { status: string | null };
  inspection: InspectionSummaryResponse | null;
  attemptNumber: number;
  canRecordResult: boolean;
  canMarkNoShow: boolean;
}

export interface AdminApplicationInspectionDetailResponse {
  application: {
    id: string;
    referenceNumber: string | null;
    status: ApplicationStatus;
  };
  inspection:
    | (InspectionSummaryResponse & {
        station: { id: string; code: string; nameKh: string; nameEn: string };
      })
    | null;
}

export interface CitizenInspectionStatusResponse {
  applicationId: string;
  applicationStatus: ApplicationStatus;
  inspection: InspectionSummaryResponse | null;
  latestAppointmentStatus: AppointmentStatus | null;
  attemptsUsed: number;
  attemptsRemaining: number;
  reinspectionRequired: boolean;
  reinspectionDeadline: string | null;
  replacementBookingRequired: boolean;
  replacementBookingDeadline: string | null;
  stickerEligible: boolean;
}

export interface CitizenInspectionHistoryResponse {
  applicationId: string;
  referenceNumber: string | null;
  attemptNumber: number;
  result: InspectionResult;
  inspectedAt: Date;
  failureReason: string | null;
  validUntil: string | null;
  validityRule: InspectionValidityRule | null;
  station: { id: string; nameKh: string; nameEn: string } | null;
  vehicle: AdminInspectionQueueResponse['vehicle'] & {
    plateCategory: string | null;
    plateProvince: string | null;
  };
}
