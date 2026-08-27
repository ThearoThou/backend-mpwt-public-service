import type { QueryRunner } from 'typeorm';

import { AddInspectionActualStation1788100000000 } from '../migrations/1788100000000-AddInspectionActualStation';

describe('AddInspectionActualStation1788100000000', () => {
  it('retains historical appointment links while adding nullable actual station support and safe backfill paths', async () => {
    const statements: string[] = [];
    const migration = new AddInspectionActualStation1788100000000();
    await migration.up({
      query: jest.fn((statement: string) => {
        statements.push(statement);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain('ADD COLUMN "actual_station_id" uuid');
    expect(sql).toContain('ALTER COLUMN "appointment_id" DROP NOT NULL');
    expect(sql).toContain('REFERENCES "inspection_stations"("id")');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('idx_inspections_actual_station');
    expect(sql).toContain('inspection_station_daily_capacities');
    expect(sql).toContain('appointment_slots');
    expect(sql).toContain('slot."station_id" = capacity."station_id"');
    expect(sql).toContain(
      'DISABLE TRIGGER "trg_guard_completed_inspection_immutable"',
    );
    expect(sql).toContain(
      'ENABLE TRIGGER "trg_guard_completed_inspection_immutable"',
    );
  });

  it('is deliberately irreversible to retain recorded actual-station facts', async () => {
    await expect(
      new AddInspectionActualStation1788100000000().down(),
    ).rejects.toThrow('irreversible');
  });
});
