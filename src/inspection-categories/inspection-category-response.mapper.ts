import { InspectionVehicleCategory } from './entities/inspection-vehicle-category.entity';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';

export interface InspectionCategoryResponse {
  id: string;
  code: string;
  nameKh: string;
  nameEn: string | null;
  vehicleClass: VehicleClass;
  validityMonths: number;
  inspectionFeeKhr: string;
  serviceFeeKhr: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function mapInspectionCategory(
  category: InspectionVehicleCategory,
): InspectionCategoryResponse {
  return {
    id: category.id,
    code: category.code,
    nameKh: category.nameKh,
    nameEn: category.nameEn,
    vehicleClass: category.vehicleClass,
    validityMonths: category.validityMonths,
    inspectionFeeKhr: category.inspectionFeeKhr,
    serviceFeeKhr: category.serviceFeeKhr,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}
