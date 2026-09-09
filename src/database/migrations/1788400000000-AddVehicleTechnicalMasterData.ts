import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleTechnicalMasterData1788400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN "colour" character varying(50),
      ADD COLUMN "engine_number" character varying(100),
      ADD COLUMN "number_of_cylinders" smallint,
      ADD COLUMN "engine_displacement_cc" integer,
      ADD COLUMN "engine_power_hp" numeric(8,2),
      ADD COLUMN "fuel_type" character varying(50),
      ADD COLUMN "number_of_seats" smallint,
      ADD COLUMN "number_of_axles" smallint,
      ADD COLUMN "steering" character varying(20),
      ADD COLUMN "vehicle_weight_kg" integer,
      ADD COLUMN "maximum_load_kg" integer,
      ADD COLUMN "maximum_gross_weight_kg" integer,
      ADD COLUMN "wheel_size" character varying(50),
      ADD COLUMN "length_mm" integer,
      ADD COLUMN "width_mm" integer,
      ADD COLUMN "height_mm" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ADD CONSTRAINT "chk_vehicles_technical_text"
        CHECK (
          ("colour" IS NULL OR ("colour" = btrim("colour") AND "colour" <> ''))
          AND ("engine_number" IS NULL OR ("engine_number" = btrim("engine_number") AND "engine_number" <> ''))
          AND ("fuel_type" IS NULL OR ("fuel_type" = btrim("fuel_type") AND "fuel_type" <> ''))
          AND ("steering" IS NULL OR ("steering" = btrim("steering") AND "steering" <> ''))
          AND ("wheel_size" IS NULL OR ("wheel_size" = btrim("wheel_size") AND "wheel_size" <> ''))
        ),
      ADD CONSTRAINT "chk_vehicles_technical_positive_values"
        CHECK (
          ("number_of_cylinders" IS NULL OR "number_of_cylinders" > 0)
          AND ("engine_displacement_cc" IS NULL OR "engine_displacement_cc" > 0)
          AND ("engine_power_hp" IS NULL OR "engine_power_hp" > 0)
          AND ("number_of_seats" IS NULL OR "number_of_seats" > 0)
          AND ("number_of_axles" IS NULL OR "number_of_axles" > 0)
          AND ("vehicle_weight_kg" IS NULL OR "vehicle_weight_kg" > 0)
          AND ("maximum_load_kg" IS NULL OR "maximum_load_kg" >= 0)
          AND ("maximum_gross_weight_kg" IS NULL OR "maximum_gross_weight_kg" > 0)
          AND ("length_mm" IS NULL OR "length_mm" > 0)
          AND ("width_mm" IS NULL OR "width_mm" > 0)
          AND ("height_mm" IS NULL OR "height_mm" > 0)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      DROP CONSTRAINT "chk_vehicles_technical_positive_values",
      DROP CONSTRAINT "chk_vehicles_technical_text",
      DROP COLUMN "height_mm",
      DROP COLUMN "width_mm",
      DROP COLUMN "length_mm",
      DROP COLUMN "wheel_size",
      DROP COLUMN "maximum_gross_weight_kg",
      DROP COLUMN "maximum_load_kg",
      DROP COLUMN "vehicle_weight_kg",
      DROP COLUMN "steering",
      DROP COLUMN "number_of_axles",
      DROP COLUMN "number_of_seats",
      DROP COLUMN "fuel_type",
      DROP COLUMN "engine_power_hp",
      DROP COLUMN "engine_displacement_cc",
      DROP COLUMN "number_of_cylinders",
      DROP COLUMN "engine_number",
      DROP COLUMN "colour"
    `);
  }
}
