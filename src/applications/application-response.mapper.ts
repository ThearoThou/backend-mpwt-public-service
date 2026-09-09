import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import type { ApplicationVehicleTechnicalSnapshot } from './application-vehicle-snapshot';

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

export interface CitizenApplicationVehicleSummary {
  registrationNumber: string | null;
  plateNumber: string | null;
  plateCategory: string | null;
  plateProvince: string | null;
  make: string | null;
  model: string | null;
  manufactureYear: number | null;
}

export interface CitizenApplicationPaymentSummary {
  status: PaymentStatus;
  totalAmount: string;
  currency: string;
}

export interface CitizenApplicationInspectionSummary {
  result: InspectionResult;
}

export interface CitizenApplicationListResponse extends RenewalApplicationResponse {
  vehicle: CitizenApplicationVehicleSummary | null;
  payment: CitizenApplicationPaymentSummary | null;
  inspection: CitizenApplicationInspectionSummary | null;
}

export interface CitizenApplicationVehicleSnapshotResponse extends ApplicationVehicleTechnicalSnapshot {
  vehicleId: string | null;
  registrationNumber: string | null;
  plateNumber: string | null;
  plateCategory: string | null;
  plateProvince: string | null;
  plateType: string | null;
  vehicleType: string | null;
  vehicleClass: string | null;
  inspectionCategoryId: string | null;
  make: string | null;
  model: string | null;
  manufactureYear: number | null;
  chassisNumber: string | null;
  firstRegistrationDate: string | null;
  lastInspectionDate: string | null;
  inspectionExpiryDate: string | null;
  registeredOwnerNameKh: string | null;
  registeredOwnerNameEn: string | null;
  registeredOwnerPhone: string | null;
}

export interface CitizenApplicationDetailResponse extends RenewalApplicationResponse {
  vehicleSnapshot: CitizenApplicationVehicleSnapshotResponse | null;
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

export function mapCitizenApplicationList(
  application: RenewalApplication & { latestInspection?: Inspection | null },
): CitizenApplicationListResponse {
  const snapshotVehicle = mapVehicleSummarySnapshot(
    application.vehicleSnapshot,
  );
  const vehicle = application.vehicle ?? null;
  const payment = application.payment ?? null;
  const inspection = application.latestInspection ?? null;

  return {
    ...mapRenewalApplication(application),
    vehicle:
      application.status === ApplicationStatus.DRAFT
        ? (snapshotVehicle ?? mapLiveVehicleSummary(vehicle))
        : snapshotVehicle,
    payment:
      payment === null
        ? null
        : {
            status: payment.status,
            totalAmount: payment.totalAmount,
            currency: payment.currency,
          },
    inspection:
      inspection === null || inspection.result === null
        ? null
        : { result: inspection.result },
  };
}

export function mapCitizenApplicationDetail(
  application: RenewalApplication,
): CitizenApplicationDetailResponse {
  return {
    ...mapRenewalApplication(application),
    vehicleSnapshot: mapVehicleSnapshot(application.vehicleSnapshot),
  };
}

function mapVehicleSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): CitizenApplicationVehicleSnapshotResponse | null {
  if (snapshot === null || snapshot === undefined) return null;

  return {
    vehicleId: snapshotString(snapshot, 'vehicleId'),
    registrationNumber: snapshotString(snapshot, 'registrationNumber'),
    plateNumber: snapshotString(snapshot, 'plateNumber'),
    plateCategory: snapshotString(snapshot, 'plateCategory'),
    plateProvince: snapshotString(snapshot, 'plateProvince'),
    plateType: snapshotString(snapshot, 'plateType'),
    vehicleType: snapshotString(snapshot, 'vehicleType'),
    vehicleClass: snapshotString(snapshot, 'vehicleClass'),
    inspectionCategoryId: snapshotString(snapshot, 'inspectionCategoryId'),
    make: snapshotString(snapshot, 'make'),
    model: snapshotString(snapshot, 'model'),
    manufactureYear: snapshotNumber(snapshot, 'manufactureYear'),
    chassisNumber: snapshotString(snapshot, 'chassisNumber'),
    firstRegistrationDate: snapshotString(snapshot, 'firstRegistrationDate'),
    lastInspectionDate: snapshotString(snapshot, 'lastInspectionDate'),
    inspectionExpiryDate: snapshotString(snapshot, 'inspectionExpiryDate'),
    registeredOwnerNameKh: snapshotString(snapshot, 'registeredOwnerNameKh'),
    registeredOwnerNameEn: snapshotString(snapshot, 'registeredOwnerNameEn'),
    registeredOwnerPhone: snapshotString(snapshot, 'registeredOwnerPhone'),
    colour: snapshotString(snapshot, 'colour'),
    engineNumber: snapshotString(snapshot, 'engineNumber'),
    numberOfCylinders: snapshotInteger(snapshot, 'numberOfCylinders'),
    engineDisplacementCc: snapshotInteger(snapshot, 'engineDisplacementCc'),
    enginePowerHp: snapshotString(snapshot, 'enginePowerHp'),
    fuelType: snapshotString(snapshot, 'fuelType'),
    numberOfSeats: snapshotInteger(snapshot, 'numberOfSeats'),
    numberOfAxles: snapshotInteger(snapshot, 'numberOfAxles'),
    steering: snapshotString(snapshot, 'steering'),
    vehicleWeightKg: snapshotInteger(snapshot, 'vehicleWeightKg'),
    maximumLoadKg: snapshotInteger(snapshot, 'maximumLoadKg'),
    maximumGrossWeightKg: snapshotInteger(snapshot, 'maximumGrossWeightKg'),
    wheelSize: snapshotString(snapshot, 'wheelSize'),
    lengthMm: snapshotInteger(snapshot, 'lengthMm'),
    widthMm: snapshotInteger(snapshot, 'widthMm'),
    heightMm: snapshotInteger(snapshot, 'heightMm'),
  };
}

function mapVehicleSummarySnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): CitizenApplicationVehicleSummary | null {
  if (snapshot === null || snapshot === undefined) return null;

  return {
    registrationNumber: snapshotString(snapshot, 'registrationNumber'),
    plateNumber: snapshotString(snapshot, 'plateNumber'),
    plateCategory: snapshotString(snapshot, 'plateCategory'),
    plateProvince: snapshotString(snapshot, 'plateProvince'),
    make: snapshotString(snapshot, 'make'),
    model: snapshotString(snapshot, 'model'),
    manufactureYear: snapshotNumber(snapshot, 'manufactureYear'),
  };
}

function mapLiveVehicleSummary(
  vehicle: RenewalApplication['vehicle'] | null,
): CitizenApplicationVehicleSummary | null {
  if (vehicle === null) return null;

  return {
    registrationNumber: vehicle.registrationNumber,
    plateNumber: vehicle.plateNumber,
    plateCategory: vehicle.plateCategory,
    plateProvince: vehicle.plateProvince,
    make: vehicle.make,
    model: vehicle.model,
    manufactureYear: vehicle.manufactureYear,
  };
}

function snapshotString(
  snapshot: Record<string, unknown>,
  key: string,
): string | null {
  const value = snapshot[key];
  return typeof value === 'string' ? value : null;
}

function snapshotNumber(
  snapshot: Record<string, unknown>,
  key: string,
): number | null {
  const value = snapshot[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function snapshotInteger(
  snapshot: Record<string, unknown>,
  key: string,
): number | null {
  const value = snapshot[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
