import { InspectionVehicleCategory } from './entities/inspection-vehicle-category.entity';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';
import { mapInspectionCategory } from './inspection-category-response.mapper';

describe('mapInspectionCategory', () => {
  it('maps a loaded category without relations or numeric conversion', () => {
    const category = {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'LIGHT-PRIVATE',
      nameKh: 'ឡានតូច',
      nameEn: null,
      vehicleClass: VehicleClass.LIGHT,
      validityMonths: 12,
      inspectionFeeKhr: '25000.00',
      serviceFeeKhr: '5000.00',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as InspectionVehicleCategory;

    expect(mapInspectionCategory(category)).toEqual({
      ...category,
    });
  });
});
