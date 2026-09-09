import { Vehicle } from './entities/vehicle.entity';
import { VehicleClass } from './enums/vehicle-class.enum';
import { VehiclePlateCategory } from './enums/vehicle-plate-category.enum';
import { mapVehicle, mapVehicleDetail } from './vehicle-response.mapper';

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
      inspectionCategory: null,
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

    expect(mapVehicleDetail(vehicle)).toMatchObject({
      vehicleClass: null,
      inspectionCategoryId: null,
      classificationVerifiedAt: null,
      colour: null,
      engineNumber: null,
      enginePowerHp: null,
    });
    expect(mapVehicle(vehicle).vehicleType).toBe('Passenger Car');
    expect(mapVehicle(vehicle).vehicleClass).not.toBe(VehicleClass.LIGHT);
  });

  it('exposes registered technical facts without conflating engine and chassis numbers', () => {
    const vehicle = {
      id: '11111111-1111-4111-8111-111111111111',
      plateNumber: '1AB-1234',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: 'Phnom Penh',
      plateType: 'Private',
      vehicleType: 'Passenger Car',
      colour: 'White',
      engineNumber: 'ENGINE-123',
      numberOfCylinders: 4,
      engineDisplacementCc: 2199,
      enginePowerHp: '177.50',
      fuelType: 'Diesel',
      numberOfSeats: 5,
      numberOfAxles: 2,
      steering: 'Left',
      vehicleWeightKg: 2200,
      maximumLoadKg: 220,
      maximumGrossWeightKg: 2970,
      wheelSize: '215/60R17',
      lengthMm: 5250,
      widthMm: 2000,
      heightMm: 1900,
      vehicleClass: null,
      inspectionCategoryId: null,
      classificationVerifiedAt: null,
      make: 'Example',
      model: 'Car',
      manufactureYear: 2020,
      chassisNumber: 'CHASSIS-987',
    } as Vehicle;

    expect(mapVehicleDetail(vehicle)).toMatchObject({
      engineNumber: 'ENGINE-123',
      chassisNumber: 'CHASSIS-987',
      enginePowerHp: '177.50',
      maximumGrossWeightKg: 2970,
      lengthMm: 5250,
    });
  });

  it("includes the vehicle's existing inspection category display names", () => {
    const vehicle = {
      id: '11111111-1111-4111-8111-111111111111',
      linkedCitizenId: '22222222-2222-4222-8222-222222222222',
      registrationNumber: 'REG-1',
      plateNumber: '1AB-1234',
      plateCategory: VehiclePlateCategory.PROVINCE,
      plateProvince: 'Phnom Penh',
      plateType: 'Private',
      vehicleType: 'Passenger Car',
      vehicleClass: VehicleClass.LIGHT,
      inspectionCategoryId: '33333333-3333-4333-8333-333333333333',
      inspectionCategory: {
        id: '33333333-3333-4333-8333-333333333333',
        nameKh: 'យានយន្តស្រាល (សាកល្បង)',
        nameEn: 'Local demo light vehicle',
      },
      classificationVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
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

    expect(mapVehicle(vehicle).inspectionCategory).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      nameKh: 'យានយន្តស្រាល (សាកល្បង)',
      nameEn: 'Local demo light vehicle',
    });
  });
});
