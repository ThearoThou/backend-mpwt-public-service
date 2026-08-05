import { MigrationInterface, QueryRunner } from 'typeorm';

import { CAMBODIAN_CAPITAL_PROVINCES_KH } from '../../vehicles/cambodian-capital-provinces';

export class AddVehiclePlateCategories1785380837522 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const provinceLiterals = CAMBODIAN_CAPITAL_PROVINCES_KH.map(
      (province) => `'${province.replace(/'/g, "''")}'`,
    ).join(', ');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "vehicles"
          WHERE "plate_province" IS NULL
            OR "plate_province" NOT IN (${provinceLiterals})
            OR "plate_number" !~ '^[0-9][A-Z]{1,2}-[0-9]{4}$'
        ) THEN
          RAISE EXCEPTION
            'Cannot migrate vehicles: legacy province labels or plate numbers are not approved PROVINCE values';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE TYPE "vehicle_plate_category" AS ENUM (
        'PROVINCE',
        'PERSONALIZED_CAMBODIA'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN "plate_category" "vehicle_plate_category"
    `);
    await queryRunner.query(`
      UPDATE "vehicles"
      SET "plate_category" = 'PROVINCE'::"vehicle_plate_category"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ALTER COLUMN "plate_category" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ALTER COLUMN "plate_province" DROP NOT NULL
    `);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d710663ba30b652bc92ac52f0c"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vehicles_province_plate_identity"
      ON "vehicles" ("plate_province", "plate_type", "plate_number")
      WHERE "plate_category" = 'PROVINCE'::"vehicle_plate_category"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vehicles_personalized_plate_number"
      ON "vehicles" ("plate_number")
      WHERE "plate_category" = 'PERSONALIZED_CAMBODIA'::"vehicle_plate_category"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ADD CONSTRAINT "chk_vehicles_plate_province_category"
      CHECK (
        ("plate_category" = 'PROVINCE'::"vehicle_plate_category" AND "plate_province" IS NOT NULL)
        OR (
          "plate_category" = 'PERSONALIZED_CAMBODIA'::"vehicle_plate_category"
          AND "plate_province" IS NULL
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "vehicles"
          WHERE "plate_category" = 'PERSONALIZED_CAMBODIA'::"vehicle_plate_category"
        ) THEN
          RAISE EXCEPTION
            'Cannot safely downgrade vehicle plate categories while personalized plates exist';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      DROP CONSTRAINT "chk_vehicles_plate_province_category"
    `);
    await queryRunner.query(
      `DROP INDEX "public"."uq_vehicles_personalized_plate_number"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."uq_vehicles_province_plate_identity"`,
    );
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ALTER COLUMN "plate_province" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_d710663ba30b652bc92ac52f0c"
      ON "vehicles" ("plate_province", "plate_type", "plate_number")
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      DROP COLUMN "plate_category"
    `);
    await queryRunner.query(`DROP TYPE "vehicle_plate_category"`);
  }
}
