import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supports appointment-free physical inspection attempts while retaining the
 * historical appointment/capacity/slot data used by older inspection rows.
 */
export class AddInspectionActualStation1788100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD COLUMN "actual_station_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ALTER COLUMN "appointment_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD CONSTRAINT "fk_inspections_actual_station"
      FOREIGN KEY ("actual_station_id")
      REFERENCES "inspection_stations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_inspections_actual_station"
      ON "inspections" ("actual_station_id")
      WHERE "actual_station_id" IS NOT NULL
    `);
    // Completed inspection rows are immutable in normal operation. The
    // migration is the controlled one-time exception needed to backfill a
    // newly introduced, derivable historical fact. All statements run in the
    // TypeORM migration transaction, so a failure restores the trigger too.
    await queryRunner.query(`
      ALTER TABLE "inspections"
      DISABLE TRIGGER "trg_guard_completed_inspection_immutable"
    `);
    await queryRunner.query(`
      UPDATE "inspections" inspection
      SET "actual_station_id" = CASE
        WHEN capacity."station_id" IS NOT NULL
          AND (slot."station_id" IS NULL OR slot."station_id" = capacity."station_id")
          THEN capacity."station_id"
        WHEN capacity."station_id" IS NULL AND slot."station_id" IS NOT NULL
          THEN slot."station_id"
        ELSE NULL
      END
      FROM "appointments" appointment
      LEFT JOIN "inspection_station_daily_capacities" capacity
        ON capacity."id" = appointment."daily_capacity_id"
      LEFT JOIN "appointment_slots" slot ON slot."id" = appointment."slot_id"
      WHERE inspection."appointment_id" = appointment."id"
        AND inspection."actual_station_id" IS NULL
        AND (
          capacity."station_id" IS NOT NULL
          OR slot."station_id" IS NOT NULL
        )
    `);
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ENABLE TRIGGER "trg_guard_completed_inspection_immutable"
    `);
  }

  public down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Migration AddInspectionActualStation1788100000000 is irreversible because actual inspection station facts must be retained',
      ),
    );
  }
}
