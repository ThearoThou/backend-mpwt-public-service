import type { Inspection } from '../inspections/entities/inspection.entity';
import type { TechnicalInspectionCertificate } from './entities/technical-inspection-certificate.entity';

export interface TechnicalInspectionCertificateResponse {
  issued: boolean;
  certificateNumber: string | null;
  issuedAt: string | null;
  inspectionDate: string | null;
  expiryDate: string | null;
  downloadAvailable: boolean;
}

export function mapTechnicalInspectionCertificateResponse(
  certificate: TechnicalInspectionCertificate | null,
  inspection: Pick<Inspection, 'completedAt' | 'validUntil'> | null,
): TechnicalInspectionCertificateResponse {
  if (certificate === null) {
    return {
      issued: false,
      certificateNumber: null,
      issuedAt: null,
      inspectionDate: null,
      expiryDate: null,
      downloadAvailable: false,
    };
  }
  if (
    inspection === null ||
    inspection.completedAt === null ||
    inspection.validUntil === null
  ) {
    throw new Error('Issued certificate inspection facts are incomplete');
  }
  return {
    issued: true,
    certificateNumber: certificate.certificateNumber,
    issuedAt: certificate.issuedAt.toISOString(),
    inspectionDate: cambodiaCalendarDate(inspection.completedAt),
    expiryDate: inspection.validUntil,
    downloadAvailable: true,
  };
}

function cambodiaCalendarDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
