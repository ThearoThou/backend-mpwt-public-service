import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePlateTypeFromProvincePlateUniqueness1785380837523 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "vehicles"
          WHERE "plate_category" = 'PROVINCE'::"vehicle_plate_category"
          GROUP BY "plate_province", "plate_number"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Cannot migrate vehicles: duplicate province plate identities must be resolved manually before removing plate type from province uniqueness';
        END IF;
      END $$
    `);
    await queryRunner.query(
      `DROP INDEX "public"."uq_vehicles_province_plate_identity"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vehicles_province_plate_identity"
      ON "vehicles" ("plate_province", "plate_number")
      WHERE "plate_category" = 'PROVINCE'::"vehicle_plate_category"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."uq_vehicles_province_plate_identity"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_vehicles_province_plate_identity"
      ON "vehicles" ("plate_province", "plate_type", "plate_number")
      WHERE "plate_category" = 'PROVINCE'::"vehicle_plate_category"
    `);
  }
}
