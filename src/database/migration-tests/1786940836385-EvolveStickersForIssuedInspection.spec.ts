import type { QueryRunner } from 'typeorm';

import { EvolveStickersForIssuedInspection1786940836385 } from '../migrations/1786940836385-EvolveStickersForIssuedInspection';

describe('EvolveStickersForIssuedInspection1786940836385', () => {
  it('guards legacy rows and defines the issued-sticker schema', async () => {
    const statements: string[] = [];
    const query = jest.fn((statement: string): Promise<void> => {
      statements.push(statement);
      return Promise.resolve();
    });
    const migration = new EvolveStickersForIssuedInspection1786940836385();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain(
      'existing sticker rows require an explicit migration plan',
    );
    expect(sql).toContain('ADD COLUMN "inspection_id" uuid NOT NULL');
    expect(sql).toContain('uq_stickers_application');
    expect(sql).toContain('uq_stickers_inspection');
    expect(sql).toContain('uq_stickers_sticker_number');
    expect(sql).toContain('chk_stickers_sticker_number_trimmed_nonempty');
    expect(sql).toContain('ALTER COLUMN "sticker_number" SET NOT NULL');
    expect(sql).toContain('"sticker_number" = btrim("sticker_number")');
    expect(sql).toContain('"sticker_number" <> \'\'');
    expect(sql).toContain('fk_stickers_inspection');
    expect(sql).toContain('REFERENCES "inspections" ("id")');
    expect(sql).toContain('fk_stickers_issued_by_user');
    expect(sql).toContain('ON DELETE SET NULL');
    expect(sql).toContain('ALTER COLUMN "issued_at" SET NOT NULL');
    expect(sql).toContain('DROP COLUMN "status"');
    expect(sql).toContain('DROP COLUMN "certificate_number"');
    expect(sql).toContain('DROP COLUMN "pickup_notes"');
    expect(sql).toContain('DROP TYPE "public"."sticker_status"');
    expect(sql).toContain('idx_stickers_issued_at');
  });

  it('is deliberately irreversible', async () => {
    const query = jest.fn().mockRejectedValue({ code: 'P0001' });
    const migration = new EvolveStickersForIssuedInspection1786940836385();

    await expect(
      migration.down({ query } as unknown as QueryRunner),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
});
