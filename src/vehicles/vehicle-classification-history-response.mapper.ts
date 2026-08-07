import { VehicleClassificationHistory } from './entities/vehicle-classification-history.entity';
import { VehicleClass } from './enums/vehicle-class.enum';

export interface VehicleClassificationHistoryResponse {
  id: string;
  vehicleId: string;
  previousVehicleClass: VehicleClass | null;
  newVehicleClass: VehicleClass;
  previousInspectionCategoryId: string | null;
  newInspectionCategoryId: string;
  changedByAdminId: string;
  reason: string;
  createdAt: Date;
}

export function mapVehicleClassificationHistory(
  history: VehicleClassificationHistory,
): VehicleClassificationHistoryResponse {
  return {
    id: history.id,
    vehicleId: history.vehicleId,
    previousVehicleClass: history.previousVehicleClass,
    newVehicleClass: history.newVehicleClass,
    previousInspectionCategoryId: history.previousInspectionCategoryId,
    newInspectionCategoryId: history.newInspectionCategoryId,
    changedByAdminId: history.changedByAdminId,
    reason: history.reason,
    createdAt: history.createdAt,
  };
}
