import type { Vehicle } from '../vehicles/entities/vehicle.entity';

export interface ApplicationVehicleTechnicalSnapshot {
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

export interface ApplicationVehicleSnapshot extends Partial<ApplicationVehicleTechnicalSnapshot> {
  [key: string]: unknown;
  vehicleId: string;
  registrationNumber: string;
  plateNumber: string;
  plateCategory: string;
  plateProvince: string | null;
  plateType: string;
  vehicleType: string;
  vehicleClass: string | null;
  inspectionCategoryId: string | null;
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
}

export function createApplicationVehicleSnapshot(
  vehicle: Vehicle,
): ApplicationVehicleSnapshot & ApplicationVehicleTechnicalSnapshot {
  return {
    vehicleId: vehicle.id,
    registrationNumber: vehicle.registrationNumber,
    plateNumber: vehicle.plateNumber,
    plateCategory: vehicle.plateCategory,
    plateProvince: vehicle.plateProvince,
    plateType: vehicle.plateType,
    vehicleType: vehicle.vehicleType,
    vehicleClass: vehicle.vehicleClass,
    inspectionCategoryId: vehicle.inspectionCategoryId,
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
