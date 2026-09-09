import type { QueryRunner } from 'typeorm';

import { AddInspectionValidity1788300000000 } from '../migrations/1788300000000-AddInspectionValidity';
import { InspectionValidityRule } from '../../inspections/enums/inspection-validity-rule.enum';

describe('AddInspectionValidity1788300000000', () => {
  it('adds nullable historical validity facts constrained to completed passes and known rules', async () => {
    const statements: string[] = [];
    await new AddInspectionValidity1788300000000().up({
      query: jest.fn((statement: string) => {
        statements.push(statement);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain('ADD COLUMN "valid_until" date');
    expect(sql).toContain('ADD COLUMN "validity_rule" character varying(60)');
    expect(sql).toContain('chk_inspections_validity_pair');
    expect(sql).toContain('"result" = \'PASS\'');
    expect(Object.values(InspectionValidityRule)).toHaveLength(19);
    for (const rule of Object.values(InspectionValidityRule)) {
      expect(sql).toContain(`'${rule}'`);
    }
  });

  it('is deliberately irreversible to retain recorded validity facts', async () => {
    await expect(
      new AddInspectionValidity1788300000000().down(),
    ).rejects.toThrow('irreversible');
  });
});
