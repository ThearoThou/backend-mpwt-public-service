import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOptionalOversizeMarkingServiceSelection1788600000000 implements MigrationInterface {
  name = 'AddOptionalOversizeMarkingServiceSelection1788600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ADD COLUMN "optional_oversize_service_selected" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      DROP COLUMN "optional_oversize_service_selected"
    `);
  }
}
