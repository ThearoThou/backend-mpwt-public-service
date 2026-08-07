import { VehicleClassificationHistory } from './entities/vehicle-classification-history.entity';
import { VehicleClass } from './enums/vehicle-class.enum';
import { mapVehicleClassificationHistory } from './vehicle-classification-history-response.mapper';

describe('mapVehicleClassificationHistory', () => {
  it('maps first-classification history with nullable previous values', () => {
    const history = {
      id: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      previousVehicleClass: null,
      newVehicleClass: VehicleClass.LIGHT,
      previousInspectionCategoryId: null,
      newInspectionCategoryId: '33333333-3333-4333-8333-333333333333',
      changedByAdminId: '44444444-4444-4444-8444-444444444444',
      reason: 'Initial classification',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    } as VehicleClassificationHistory;

    expect(mapVehicleClassificationHistory(history)).toEqual({ ...history });
  });
});
