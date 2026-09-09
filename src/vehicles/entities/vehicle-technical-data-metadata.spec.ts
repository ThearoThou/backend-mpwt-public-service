import 'reflect-metadata';

import { getMetadataArgsStorage } from 'typeorm';

import { Vehicle } from './vehicle.entity';

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

describe('Vehicle technical master data metadata', () => {
  it('maps all technical fields as nullable, non-unique columns', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === Vehicle,
    );

    for (const field of TECHNICAL_FIELDS) {
      const column = columns.find(
        (candidate) => candidate.propertyName === field,
      );
      expect(column).toBeDefined();
      expect(column?.options.nullable).toBe(true);
      expect(column?.options.unique).not.toBe(true);
      expect(column?.options.default).toBeUndefined();
    }
  });

  it('uses a string-backed numeric(8,2) mapping for engine power', () => {
    const column = getMetadataArgsStorage().columns.find(
      (candidate) =>
        candidate.target === Vehicle &&
        candidate.propertyName === 'enginePowerHp',
    );

    expect(column?.options).toMatchObject({
      name: 'engine_power_hp',
      type: 'numeric',
      precision: 8,
      scale: 2,
      nullable: true,
    });
  });
});
