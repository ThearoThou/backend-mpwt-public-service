import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationRejectionReason1786342740000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ADD COLUMN "current_rejection_reason" text
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ADD CONSTRAINT "chk_renewal_applications_current_rejection_reason"
      CHECK (
        "current_rejection_reason" IS NULL
        OR char_length(btrim("current_rejection_reason")) BETWEEN 1 AND 500
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      DROP CONSTRAINT "chk_renewal_applications_current_rejection_reason"
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      DROP COLUMN "current_rejection_reason"
    `);
  }
}
