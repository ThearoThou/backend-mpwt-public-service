import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDailyInspectionStationCapacities1786422084518 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inspection_station_daily_capacities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "station_id" uuid NOT NULL,
        "capacity_date" date NOT NULL,
        "daily_capacity" integer NOT NULL,
        "reserved_count" integer NOT NULL DEFAULT 0,
        "is_closed" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inspection_station_daily_capacities" PRIMARY KEY ("id"),
        CONSTRAINT "uq_inspection_station_daily_capacities_station_date"
          UNIQUE ("station_id", "capacity_date"),
        CONSTRAINT "chk_inspection_station_daily_capacities_daily_capacity"
          CHECK ("daily_capacity" > 0),
        CONSTRAINT "chk_inspection_station_daily_capacities_reserved_count"
          CHECK (
            "reserved_count" >= 0
            AND "reserved_count" <= "daily_capacity"
          )
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "inspection_station_daily_capacities"
      ADD CONSTRAINT "fk_inspection_station_daily_capacities_station"
      FOREIGN KEY ("station_id")
      REFERENCES "inspection_stations" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ADD COLUMN "preferred_inspection_station_id" uuid,
      ADD COLUMN "preferred_inspection_date" date
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ADD CONSTRAINT "fk_renewal_applications_preferred_inspection_station"
      FOREIGN KEY ("preferred_inspection_station_id")
      REFERENCES "inspection_stations" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ADD CONSTRAINT "chk_renewal_applications_preferred_inspection_selection_pair"
      CHECK (
        (
          "preferred_inspection_station_id" IS NULL
          AND "preferred_inspection_date" IS NULL
        )
        OR
        (
          "preferred_inspection_station_id" IS NOT NULL
          AND "preferred_inspection_date" IS NOT NULL
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_renewal_applications_preferred_station_date"
      ON "renewal_applications" (
        "preferred_inspection_station_id",
        "preferred_inspection_date"
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD COLUMN "daily_capacity_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      ALTER COLUMN "slot_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD CONSTRAINT "fk_appointments_daily_capacity"
      FOREIGN KEY ("daily_capacity_id")
      REFERENCES "inspection_station_daily_capacities" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD CONSTRAINT "chk_appointments_slot_or_daily_capacity"
      CHECK (
        ("slot_id" IS NOT NULL AND "daily_capacity_id" IS NULL)
        OR
        ("slot_id" IS NULL AND "daily_capacity_id" IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_appointments_daily_capacity_status"
      ON "appointments" ("daily_capacity_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "appointments"
          WHERE "daily_capacity_id" IS NOT NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot revert daily inspection capacity migration: daily-capacity appointments exist'
            USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM "appointments"
          WHERE "slot_id" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot revert daily inspection capacity migration: appointments with NULL slot_id exist'
            USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM "renewal_applications"
          WHERE "preferred_inspection_station_id" IS NOT NULL
             OR "preferred_inspection_date" IS NOT NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot revert daily inspection capacity migration: application preferences exist'
            USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM "inspection_station_daily_capacities"
        ) THEN
          RAISE EXCEPTION
            'Cannot revert daily inspection capacity migration: daily capacity rows exist'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(
      `DROP INDEX "public"."idx_appointments_daily_capacity_status"`,
    );

    await queryRunner.query(`
      ALTER TABLE "appointments"
      DROP CONSTRAINT "chk_appointments_slot_or_daily_capacity"
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      DROP CONSTRAINT "fk_appointments_daily_capacity"
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      DROP COLUMN "daily_capacity_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      ALTER COLUMN "slot_id" SET NOT NULL
    `);

    await queryRunner.query(
      `DROP INDEX "public"."idx_renewal_applications_preferred_station_date"`,
    );

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      DROP CONSTRAINT "chk_renewal_applications_preferred_inspection_selection_pair"
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      DROP CONSTRAINT "fk_renewal_applications_preferred_inspection_station"
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      DROP COLUMN "preferred_inspection_date",
      DROP COLUMN "preferred_inspection_station_id"
    `);

    await queryRunner.query(`
      DROP TABLE "inspection_station_daily_capacities"
    `);
  }
}
