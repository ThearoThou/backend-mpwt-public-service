import { Vehicle } from './entities/vehicle.entity';
import { CAMBODIAN_PLATE_DISPLAY_LABEL_KH } from './cambodian-capital-provinces';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';

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

export function mapVehicle(vehicle: Vehicle): VehicleResponse {
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
