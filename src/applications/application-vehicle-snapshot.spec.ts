import type { Vehicle } from '../vehicles/entities/vehicle.entity';
import { createApplicationVehicleSnapshot } from './application-vehicle-snapshot';

const TECHNICAL_FIELDS = [
  'colour',
  'engineNumber',
  'numberOfCylinders',
  'engineDisplacementCc',
  'enginePowerHp',
  'fuelType',
  'numberOfSeats',
  'numberOfAxles',
  'steering',
  'vehicleWeightKg',
  'maximumLoadKg',
  'maximumGrossWeightKg',
  'wheelSize',
  'lengthMm',
  'widthMm',
  'heightMm',
] as const;

describe('certificate vehicle snapshot contract', () => {
  it('freezes all 16 technical fields, including string-precision engine power', () => {
    const vehicle = sourceVehicle();
    const snapshot = createApplicationVehicleSnapshot(vehicle);

    expect(Object.keys(snapshot)).toEqual(
      expect.arrayContaining(TECHNICAL_FIELDS),
    );
    expect(snapshot).toMatchObject({
      make: 'Hyundai',
      model: 'Staria',
      manufactureYear: 2022,
      vehicleType: 'PASSENGER_VAN',
      chassisNumber: 'KMJYD371BNU068732',
      colour: 'White',
      engineNumber: 'D4HBN02273001',
      numberOfCylinders: 4,
      engineDisplacementCc: 2199,
      enginePowerHp: '177.50',
      fuelType: 'Diesel',
      numberOfSeats: 11,
      numberOfAxles: 2,
      steering: 'Left',
      vehicleWeightKg: 2200,
      maximumLoadKg: 220,
      maximumGrossWeightKg: 2970,
      wheelSize: '235/55R18',
      lengthMm: 5250,
      widthMm: 2000,
      heightMm: 1900,
    });
    expect(typeof snapshot.enginePowerHp).toBe('string');

    vehicle.enginePowerHp = '999.00';
    vehicle.colour = 'Black';
    expect(snapshot.enginePowerHp).toBe('177.50');
    expect(snapshot.colour).toBe('White');
  });
});

function sourceVehicle(): Vehicle {
  return {
    id: 'vehicle-id',
    registrationNumber: 'REG-1',
    plateNumber: '2A-1234',
    plateCategory: 'PHNOM_PENH',
    plateProvince: 'Phnom Penh',
    plateType: 'PRIVATE',
    vehicleType: 'PASSENGER_VAN',
    vehicleClass: 'LIGHT',
    inspectionCategoryId: 'category-id',
    make: 'Hyundai',
    model: 'Staria',
    manufactureYear: 2022,
    chassisNumber: 'KMJYD371BNU068732',
    firstRegistrationDate: '2022-01-01',
    lastInspectionDate: '2022-12-09',
    inspectionExpiryDate: '2026-12-09',
    registeredOwnerNameKh: 'Owner',
    registeredOwnerNameEn: 'Owner',
    registeredOwnerPhone: '010000000',
    colour: 'White',
    engineNumber: 'D4HBN02273001',
    numberOfCylinders: 4,
    engineDisplacementCc: 2199,
    enginePowerHp: '177.50',
    fuelType: 'Diesel',
    numberOfSeats: 11,
    numberOfAxles: 2,
    steering: 'Left',
    vehicleWeightKg: 2200,
    maximumLoadKg: 220,
    maximumGrossWeightKg: 2970,
    wheelSize: '235/55R18',
    lengthMm: 5250,
    widthMm: 2000,
    heightMm: 1900,
  } as Vehicle;
}
