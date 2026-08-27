import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeCitizenProfileKhmerNameOptional1786940836386 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "citizen_profiles"
      ALTER COLUMN "name_kh" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "citizen_profiles" WHERE "name_kh" IS NULL) THEN
          RAISE EXCEPTION
            'Cannot restore citizen_profiles.name_kh NOT NULL while Khmer names are absent'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      ALTER TABLE "citizen_profiles"
      ALTER COLUMN "name_kh" SET NOT NULL
    `);
  }
}
