import type { QueryRunner } from 'typeorm';

import { AddPhysicalInspectionWorkflow1786681183523 } from '../migrations/1786681183523-AddPhysicalInspectionWorkflow';

describe('AddPhysicalInspectionWorkflow1786681183523', () => {
  it('defines guards and the approved Phase 6 database foundation', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string): Promise<void> => {
      statements.push(statement);
      return Promise.resolve();
    });
    const migration = new AddPhysicalInspectionWorkflow1786681183523();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain(
      'existing inspection rows require an explicit attempt-number migration plan',
    );
    expect(sql).toContain(
      'public.application_status already contains INSPECTION_FAILED',
    );
    expect(sql).toContain("ADD VALUE 'INSPECTION_FAILED'");
    expect(sql).toContain('chk_inspections_attempt_number');
    expect(sql).toContain('uq_inspections_application_attempt');
    expect(sql).toContain('chk_inspections_state_consistency');
    expect(sql).toContain('chk_inspections_result_failure_reason');
    expect(sql).toContain('fn_guard_completed_inspection_immutable');
    expect(sql).toContain('trg_guard_completed_inspection_immutable');
    expect(sql).toContain('ADD COLUMN "reason" character varying(100)');
  });

  it('is deliberately irreversible', async () => {
    const query = jest.fn().mockRejectedValue({ code: 'P0001' });
    const migration = new AddPhysicalInspectionWorkflow1786681183523();

    await expect(
      migration.down({ query } as unknown as QueryRunner),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
});
