import type { QueryRunner } from 'typeorm';

import { CreatePasswordResetAuthorizations1788200000000 } from '../migrations/1788200000000-CreatePasswordResetAuthorizations';

describe('CreatePasswordResetAuthorizations1788200000000', () => {
  it('creates hashed, expiring, one-time reset authorizations owned by users', async () => {
    const statements: string[] = [];
    const migration = new CreatePasswordResetAuthorizations1788200000000();
    await migration.up({
      query: jest.fn((statement: string) => {
        statements.push(statement);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain('CREATE TABLE "password_reset_authorizations"');
    expect(sql).toContain('"token_hash" character varying(64) NOT NULL');
    expect(sql).not.toContain('"reset_token"');
    expect(sql).toContain('UNIQUE ("token_hash")');
    expect(sql).toContain('"used_at" TIMESTAMP WITH TIME ZONE');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('idx_password_reset_authorizations_user_active');
  });

  it('drops only the reset-authorization table on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new CreatePasswordResetAuthorizations1788200000000().down({
      query,
    } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP TABLE "password_reset_authorizations"',
    );
  });
});
