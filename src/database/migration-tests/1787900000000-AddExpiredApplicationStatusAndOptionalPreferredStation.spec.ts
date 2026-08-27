import type { QueryRunner } from 'typeorm';

import { AddExpiredApplicationStatusAndOptionalPreferredStation1787900000000 } from '../migrations/1787900000000-AddExpiredApplicationStatusAndOptionalPreferredStation';

describe('AddExpiredApplicationStatusAndOptionalPreferredStation1787900000000', () => {
  it('adds EXPIRED without removing the historical appointment-selection value and permits a null station', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string): Promise<void> => {
      statements.push(statement);
      return Promise.resolve();
    });
    const migration =
      new AddExpiredApplicationStatusAndOptionalPreferredStation1787900000000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'EXPIRED'");
    expect(sql).toContain(
      'DROP CONSTRAINT "chk_renewal_applications_preferred_inspection_selection_pair"',
    );
    expect(sql).toContain('preferred_inspection_station_id" IS NULL');
    expect(sql).toContain('preferred_inspection_date" IS NOT NULL');
  });

  it('is deliberately irreversible because enum values cannot be safely removed', async () => {
    const migration =
      new AddExpiredApplicationStatusAndOptionalPreferredStation1787900000000();
    await expect(migration.down()).rejects.toThrow('irreversible');
  });
});
