import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpiredApplicationStatusAndOptionalPreferredStation1787900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."application_status"
      ADD VALUE IF NOT EXISTS 'EXPIRED'
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      DROP CONSTRAINT "chk_renewal_applications_preferred_inspection_selection_pair"
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ADD CONSTRAINT "chk_renewal_applications_preferred_inspection_station_requires_date"
      CHECK (
        "preferred_inspection_station_id" IS NULL
        OR "preferred_inspection_date" IS NOT NULL
      )
    `);
  }

  public down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Migration AddExpiredApplicationStatusAndOptionalPreferredStation1787900000000 is irreversible because PostgreSQL enum values cannot be safely removed.',
      ),
    );
  }
}
