import { ApplicationStatus } from '../applications/enums/application-status.enum';

export type StickerPresentationState =
  'NOT_READY' | 'READY_FOR_ISSUANCE' | 'ISSUED';

export interface StickerStationResponse {
  id: string;
  code: string;
  nameKh: string;
  nameEn: string;
}

export interface StickerInspectionResponse {
  id: string;
  attemptNumber: number;
  completedAt: Date;
}

export interface StickerResponse {
  id: string;
  stickerNumber: string;
  issuedAt: Date;
}

export interface StickerDetailResponse {
  state: StickerPresentationState;
  application: {
    id: string;
    referenceNumber: string | null;
    status: ApplicationStatus;
    completedAt: Date | null;
  };
  vehicle: {
    registrationNumber: string | null;
    plateNumber: string | null;
    make: string | null;
    model: string | null;
  };
  ownerName: string | null;
  inspection: StickerInspectionResponse | null;
  station: StickerStationResponse | null;
  sticker: StickerResponse | null;
  actions: { canIssueSticker: boolean };
}

export interface AdminStickerListResponse {
  applicationId: string;
  referenceNumber: string | null;
  vehicle: StickerDetailResponse['vehicle'];
  ownerName: string | null;
  inspection: StickerInspectionResponse | null;
  station: StickerStationResponse | null;
  sticker: StickerResponse | null;
}
