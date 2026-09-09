import type { QueryRunner } from 'typeorm';

import { CreateTechnicalInspectionCertificates1788500000000 } from '../migrations/1788500000000-CreateTechnicalInspectionCertificates';

describe('CreateTechnicalInspectionCertificates1788500000000', () => {
  it('creates only the minimal certificate table and integrity constraints', async () => {
    const statements: string[] = [];
    await new CreateTechnicalInspectionCertificates1788500000000().up(
      runner(statements),
    );
    const sql = statements.join('\n');

    expect(sql).toContain('CREATE TABLE "technical_inspection_certificates"');
    expect(sql).toContain('"application_id" uuid NOT NULL');
    expect(sql).toContain('"inspection_id" uuid NOT NULL');
    expect(sql).toContain(
      '"certificate_number" character varying(100) NOT NULL',
    );
    expect(sql).toContain('"issued_at" TIMESTAMP WITH TIME ZONE NOT NULL');
    expect(sql).toContain('"issued_by_user_id" uuid');
    expect(sql).toContain(
      '"artifact_file_key" character varying(500) NOT NULL',
    );
    expect(sql).toContain('UNIQUE ("application_id")');
    expect(sql).toContain('UNIQUE ("inspection_id")');
    expect(sql).toContain('UNIQUE ("certificate_number")');
    expect(sql).toContain('UNIQUE ("artifact_file_key")');
    expect(sql).toContain('"certificate_number" = btrim("certificate_number")');
    expect(sql).toContain('REFERENCES "renewal_applications" ("id")');
    expect(sql).toContain('REFERENCES "inspections" ("id")');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('REFERENCES "users" ("id")');
    expect(sql).toContain('ON DELETE SET NULL');
    expect(sql).not.toContain('INSERT INTO');
    expect(sql).not.toContain('UPDATE "renewal_applications"');
    expect(sql).not.toContain('vehicle_snapshot');
  });

  it('drops only the certificate table on rollback', async () => {
    const statements: string[] = [];
    await new CreateTechnicalInspectionCertificates1788500000000().down(
      runner(statements),
    );

    expect(statements).toEqual([
      'DROP TABLE "technical_inspection_certificates"',
    ]);
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
