import type { QueryRunner } from 'typeorm';

import { AddVehicleTechnicalMasterData1788400000000 } from '../migrations/1788400000000-AddVehicleTechnicalMasterData';

const COLUMNS = [
  'colour',
  'engine_number',
  'number_of_cylinders',
  'engine_displacement_cc',
  'engine_power_hp',
  'fuel_type',
  'number_of_seats',
  'number_of_axles',
  'steering',
  'vehicle_weight_kg',
  'maximum_load_kg',
  'maximum_gross_weight_kg',
  'wheel_size',
  'length_mm',
  'width_mm',
  'height_mm',
] as const;

describe('AddVehicleTechnicalMasterData1788400000000', () => {
  it('adds exactly the nullable technical columns without defaults or uniqueness', async () => {
    const statements: string[] = [];
    await new AddVehicleTechnicalMasterData1788400000000().up(
      runner(statements),
    );

    const sql = statements.join('\n');
    for (const column of COLUMNS) {
      expect(sql).toContain(`ADD COLUMN "${column}"`);
    }
    expect(sql).toContain('"engine_power_hp" numeric(8,2)');
    expect(sql).toContain('"maximum_load_kg" >= 0');
    expect(sql).not.toMatch(/ADD COLUMN[^;]*(?:DEFAULT|UNIQUE)/i);
    expect(sql).not.toContain('certificate');
  });

  it('removes only the technical columns and their constraints on rollback', async () => {
    const statements: string[] = [];
    await new AddVehicleTechnicalMasterData1788400000000().down(
      runner(statements),
    );

    const sql = statements.join('\n');
    for (const column of COLUMNS) {
      expect(sql).toContain(`DROP COLUMN "${column}"`);
    }
    expect(sql).toContain('DROP CONSTRAINT "chk_vehicles_technical_text"');
    expect(sql).toContain(
      'DROP CONSTRAINT "chk_vehicles_technical_positive_values"',
    );
  });
});

function runner(statements: string[]): QueryRunner {
  return {
    query: jest.fn((statement: string) => {
      statements.push(statement);
      return Promise.resolve();
    }),
  } as unknown as QueryRunner;
}
