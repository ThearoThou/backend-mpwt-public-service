import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRenewalApplicationFoundation1786074596508 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "renewal_applications"
          WHERE "status" IN (
            'READY_FOR_INSPECTION'::"public"."application_status",
            'INSPECTION_FAILED'::"public"."application_status"
          )
        ) THEN
          RAISE EXCEPTION
            'Cannot migrate application_status: approved legacy-status mapping is required for READY_FOR_INSPECTION or INSPECTION_FAILED rows'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "application_documents"
          WHERE "file_size_bytes" > 5242880
        ) THEN
          RAISE EXCEPTION
            'Cannot add the 5 MB document-size limit: oversized application document rows exist'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT "vehicle_id"
          FROM "renewal_applications"
          WHERE "status" IN (
            'SUBMITTED'::"public"."application_status",
            'UNDER_REVIEW'::"public"."application_status",
            'CORRECTION_REQUIRED'::"public"."application_status"
          )
          GROUP BY "vehicle_id"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Cannot enforce one unfinished application per vehicle: conflicting application rows exist'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(
      `DROP INDEX "public"."uq_active_application_per_vehicle"`,
    );

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ALTER COLUMN "status" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."application_status"
      RENAME TO "application_status_legacy"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."application_status" AS ENUM (
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'CORRECTION_REQUIRED',
        'APPOINTMENT_SELECTION_REQUIRED',
        'APPROVED',
        'REJECTED',
        'REINSPECTION_REQUIRED',
        'CANCELLED',
        'COMPLETED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ALTER COLUMN "status" TYPE "public"."application_status"
      USING "status"::text::"public"."application_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"public"."application_status"
    `);

    await queryRunner.query(`DROP TYPE "public"."application_status_legacy"`);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ALTER COLUMN "reference_number" DROP NOT NULL,
      ALTER COLUMN "applicant_snapshot" DROP NOT NULL,
      ALTER COLUMN "vehicle_snapshot" DROP NOT NULL,
      ALTER COLUMN "submitted_at" DROP NOT NULL,
      ALTER COLUMN "submitted_at" DROP DEFAULT
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT "vehicle_id"
          FROM "renewal_applications"
          WHERE "status" IN (
            'DRAFT'::"public"."application_status",
            'SUBMITTED'::"public"."application_status",
            'UNDER_REVIEW'::"public"."application_status",
            'CORRECTION_REQUIRED'::"public"."application_status",
            'APPOINTMENT_SELECTION_REQUIRED'::"public"."application_status",
            'APPROVED'::"public"."application_status",
            'REINSPECTION_REQUIRED'::"public"."application_status"
          )
          GROUP BY "vehicle_id"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Cannot enforce one unfinished application per vehicle: conflicting application rows exist'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_unfinished_application_per_vehicle"
      ON "renewal_applications" ("vehicle_id")
      WHERE "status" IN (
        'DRAFT'::"public"."application_status",
        'SUBMITTED'::"public"."application_status",
        'UNDER_REVIEW'::"public"."application_status",
        'CORRECTION_REQUIRED'::"public"."application_status",
        'APPOINTMENT_SELECTION_REQUIRED'::"public"."application_status",
        'APPROVED'::"public"."application_status",
        'REINSPECTION_REQUIRED'::"public"."application_status"
      )
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."document_type"
      RENAME VALUE 'NATIONAL_ID' TO 'CITIZEN_ID_CARD'
    `);

    await queryRunner.query(`
      ALTER TABLE "application_documents"
      ADD CONSTRAINT "chk_application_documents_file_size_max_5mb"
      CHECK ("file_size_bytes" <= 5242880)
    `);

    await queryRunner.query(`
      CREATE TABLE "renewal_application_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "previous_status" "public"."application_status",
        "new_status" "public"."application_status" NOT NULL,
        "changed_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_renewal_application_status_history" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_application_status_history"
      ADD CONSTRAINT "fk_renewal_application_status_history_application"
      FOREIGN KEY ("application_id")
      REFERENCES "renewal_applications" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_application_status_history"
      ADD CONSTRAINT "fk_renewal_application_status_history_changed_by"
      FOREIGN KEY ("changed_by_user_id")
      REFERENCES "users" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_application_status_history"
      ADD CONSTRAINT "chk_renewal_application_status_history_transition"
      CHECK (
        (
          "previous_status" IS NULL
          AND "new_status" = 'DRAFT'::"public"."application_status"
        )
        OR (
          "previous_status" IS NOT NULL
          AND "previous_status" <> "new_status"
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_renewal_application_status_history_application_created"
      ON "renewal_application_status_history" ("application_id", "created_at", "id")
    `);

    await queryRunner.query(`
      CREATE FUNCTION "public"."fn_guard_renewal_application_status_history"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION
          'renewal_application_status_history is immutable; UPDATE and DELETE are not permitted'
          USING ERRCODE = 'P0001';
        RETURN NULL;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trg_guard_renewal_application_status_history_immutable"
      BEFORE UPDATE OR DELETE
      ON "renewal_application_status_history"
      FOR EACH ROW
      EXECUTE FUNCTION "public"."fn_guard_renewal_application_status_history"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "renewal_application_status_history"
        ) THEN
          RAISE EXCEPTION
            'Cannot revert renewal application foundation: authoritative status-history rows exist'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "renewal_applications"
          WHERE "status" IN (
            'DRAFT'::"public"."application_status",
            'APPOINTMENT_SELECTION_REQUIRED'::"public"."application_status",
            'APPROVED'::"public"."application_status",
            'REJECTED'::"public"."application_status",
            'REINSPECTION_REQUIRED'::"public"."application_status"
          )
        ) THEN
          RAISE EXCEPTION
            'Cannot revert application_status: target-only status rows have no exact legacy equivalent'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "renewal_applications"
          WHERE "reference_number" IS NULL
            OR "applicant_snapshot" IS NULL
            OR "vehicle_snapshot" IS NULL
            OR "submitted_at" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot restore legacy renewal application NOT NULL fields: draft-compatible NULL values exist'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      DROP TRIGGER "trg_guard_renewal_application_status_history_immutable"
      ON "renewal_application_status_history"
    `);

    await queryRunner.query(
      `DROP FUNCTION "public"."fn_guard_renewal_application_status_history"()`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."idx_renewal_application_status_history_application_created"`,
    );

    await queryRunner.query(`
      ALTER TABLE "renewal_application_status_history"
      DROP CONSTRAINT "fk_renewal_application_status_history_changed_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_application_status_history"
      DROP CONSTRAINT "fk_renewal_application_status_history_application"
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_application_status_history"
      DROP CONSTRAINT "chk_renewal_application_status_history_transition"
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_application_status_history"
      DROP CONSTRAINT "pk_renewal_application_status_history"
    `);

    await queryRunner.query(`DROP TABLE "renewal_application_status_history"`);

    await queryRunner.query(`
      ALTER TABLE "application_documents"
      DROP CONSTRAINT "chk_application_documents_file_size_max_5mb"
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."document_type"
      RENAME VALUE 'CITIZEN_ID_CARD' TO 'NATIONAL_ID'
    `);

    await queryRunner.query(
      `DROP INDEX "public"."uq_unfinished_application_per_vehicle"`,
    );

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ALTER COLUMN "status" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."application_status"
      RENAME TO "application_status_phase2"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."application_status" AS ENUM (
        'SUBMITTED',
        'UNDER_REVIEW',
        'CORRECTION_REQUIRED',
        'READY_FOR_INSPECTION',
        'INSPECTION_FAILED',
        'COMPLETED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ALTER COLUMN "status" TYPE "public"."application_status"
      USING "status"::text::"public"."application_status"
    `);

    await queryRunner.query(`DROP TYPE "public"."application_status_phase2"`);

    await queryRunner.query(`
      ALTER TABLE "renewal_applications"
      ALTER COLUMN "status" SET DEFAULT 'SUBMITTED'::"public"."application_status",
      ALTER COLUMN "reference_number" SET NOT NULL,
      ALTER COLUMN "applicant_snapshot" SET NOT NULL,
      ALTER COLUMN "vehicle_snapshot" SET NOT NULL,
      ALTER COLUMN "submitted_at" SET NOT NULL,
      ALTER COLUMN "submitted_at" SET DEFAULT now()
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_active_application_per_vehicle"
      ON "renewal_applications" ("vehicle_id")
      WHERE "status" IN (
        'SUBMITTED',
        'UNDER_REVIEW',
        'CORRECTION_REQUIRED',
        'READY_FOR_INSPECTION'
      )
    `);
  }
}
