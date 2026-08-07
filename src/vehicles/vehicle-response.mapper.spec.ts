import { Vehicle } from './entities/vehicle.entity';
import { VehicleClass } from './enums/vehicle-class.enum';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';
import { mapVehicle } from './vehicle-response.mapper';

describe('mapVehicle', () => {
  it('returns null classification fields for an existing unclassified vehicle', () => {
    const vehicle = {
      id: '11111111-1111-4111-8111-111111111111',
      linkedCitizenId: '22222222-2222-4222-8222-222222222222',
      registrationNumber: 'REG-1',
      plateNumber: '1AB-1234',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: 'Phnom Penh',
      plateType: 'Private',
      vehicleType: 'Passenger Car',
      vehicleClass: null,
      inspectionCategoryId: null,
      classificationVerifiedAt: null,
      classificationVerifiedBy: null,
      make: 'Example',
      model: 'Car',
      manufactureYear: null,
      chassisNumber: 'CHASSIS-1',
      firstRegistrationDate: '2020-01-01',
      lastInspectionDate: null,
      inspectionExpiryDate: '2026-01-01',
      registeredOwnerNameKh: 'ម្ចាស់',
      registeredOwnerNameEn: 'Owner',
      registeredOwnerPhone: '+85512345678',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as Vehicle;

    expect(mapVehicle(vehicle)).toMatchObject({
      vehicleClass: null,
      inspectionCategoryId: null,
      classificationVerifiedAt: null,
    });
    expect(mapVehicle(vehicle).vehicleType).toBe('Passenger Car');
    expect(mapVehicle(vehicle).vehicleClass).not.toBe(VehicleClass.LIGHT);
  });
});
