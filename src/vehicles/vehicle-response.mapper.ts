import { Vehicle } from './entities/vehicle.entity';
import { CAMBODIAN_PLATE_DISPLAY_LABEL_KH } from './cambodian-capital-provinces';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';
import { VehicleClass } from './enums/vehicle-class.enum';

type VehicleWithInspectionCategory = Vehicle & {
  inspectionCategory?: {
    id: string;
    nameKh: string;
    nameEn: string | null;
  } | null;
};

export interface VehicleResponse {
  id: string;
  linkedCitizenId: string | null;
  registrationNumber: string;
  plateNumber: string;
  plateCategory: VehiclePlateCategory;
  plateProvince: string | null;
  plateDisplayLabelKh: string;
  plateType: string;
  vehicleType: string;
  vehicleClass: VehicleClass | null;
  inspectionCategoryId: string | null;
  inspectionCategory: {
    id: string;
    nameKh: string;
    nameEn: string | null;
  } | null;
  classificationVerifiedAt: Date | null;
  make: string;
  model: string;
  manufactureYear: number | null;
  chassisNumber: string;
  firstRegistrationDate: string;
  lastInspectionDate: string | null;
  inspectionExpiryDate: string;
  registeredOwnerNameKh: string;
  registeredOwnerNameEn: string;
  registeredOwnerPhone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleTechnicalDataResponse {
  colour: string | null;
  engineNumber: string | null;
  numberOfCylinders: number | null;
  engineDisplacementCc: number | null;
  enginePowerHp: string | null;
  fuelType: string | null;
  numberOfSeats: number | null;
  numberOfAxles: number | null;
  steering: string | null;
  vehicleWeightKg: number | null;
  maximumLoadKg: number | null;
  maximumGrossWeightKg: number | null;
  wheelSize: string | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
}

export interface VehicleDetailResponse
  extends VehicleResponse, VehicleTechnicalDataResponse {}

export function mapVehicle(
  vehicle: VehicleWithInspectionCategory,
): VehicleResponse {
  return {
    id: vehicle.id,
    linkedCitizenId: vehicle.linkedCitizenId,
    registrationNumber: vehicle.registrationNumber,
    plateNumber: vehicle.plateNumber,
    plateCategory: vehicle.plateCategory,
    plateProvince: vehicle.plateProvince,
    plateDisplayLabelKh:
      vehicle.plateCategory === VehiclePlateCategory.PERSONALIZED_CAMBODIA
        ? CAMBODIAN_PLATE_DISPLAY_LABEL_KH
        : (vehicle.plateProvince ?? ''),
    plateType: vehicle.plateType,
    vehicleType: vehicle.vehicleType,
    vehicleClass: vehicle.vehicleClass ?? null,
    inspectionCategoryId: vehicle.inspectionCategoryId ?? null,
    inspectionCategory:
      vehicle.inspectionCategory === undefined ||
      vehicle.inspectionCategory === null
        ? null
        : {
            id: vehicle.inspectionCategory.id,
            nameKh: vehicle.inspectionCategory.nameKh,
            nameEn: vehicle.inspectionCategory.nameEn,
          },
    classificationVerifiedAt: vehicle.classificationVerifiedAt ?? null,
    make: vehicle.make,
    model: vehicle.model,
    manufactureYear: vehicle.manufactureYear,
    chassisNumber: vehicle.chassisNumber,
    firstRegistrationDate: vehicle.firstRegistrationDate,
    lastInspectionDate: vehicle.lastInspectionDate,
    inspectionExpiryDate: vehicle.inspectionExpiryDate,
    registeredOwnerNameKh: vehicle.registeredOwnerNameKh,
    registeredOwnerNameEn: vehicle.registeredOwnerNameEn,
    registeredOwnerPhone: vehicle.registeredOwnerPhone,
    isActive: vehicle.isActive,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

export function mapVehicleDetail(
  vehicle: VehicleWithInspectionCategory,
): VehicleDetailResponse {
  return {
    ...mapVehicle(vehicle),
    colour: vehicle.colour ?? null,
    engineNumber: vehicle.engineNumber ?? null,
    numberOfCylinders: vehicle.numberOfCylinders ?? null,
    engineDisplacementCc: vehicle.engineDisplacementCc ?? null,
    enginePowerHp: vehicle.enginePowerHp ?? null,
    fuelType: vehicle.fuelType ?? null,
    numberOfSeats: vehicle.numberOfSeats ?? null,
    numberOfAxles: vehicle.numberOfAxles ?? null,
    steering: vehicle.steering ?? null,
    vehicleWeightKg: vehicle.vehicleWeightKg ?? null,
    maximumLoadKg: vehicle.maximumLoadKg ?? null,
    maximumGrossWeightKg: vehicle.maximumGrossWeightKg ?? null,
    wheelSize: vehicle.wheelSize ?? null,
    lengthMm: vehicle.lengthMm ?? null,
    widthMm: vehicle.widthMm ?? null,
    heightMm: vehicle.heightMm ?? null,
  };
}
