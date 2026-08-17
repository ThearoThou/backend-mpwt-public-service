import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhysicalInspectionWorkflow1786681183523 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "inspections") THEN
          RAISE EXCEPTION
            'Cannot add inspections.attempt_number NOT NULL: existing inspection rows require an explicit attempt-number migration plan'
            USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM pg_enum enum_
          INNER JOIN pg_type type_ ON type_.oid = enum_.enumtypid
          INNER JOIN pg_namespace namespace_
            ON namespace_.oid = type_.typnamespace
          WHERE namespace_.nspname = 'public'
            AND type_.typname = 'application_status'
            AND enum_.enumlabel = 'INSPECTION_FAILED'
        ) THEN
          RAISE EXCEPTION
            'Cannot apply physical inspection workflow migration: public.application_status already contains INSPECTION_FAILED'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."application_status"
      ADD VALUE 'INSPECTION_FAILED'
    `);

    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD COLUMN "attempt_number" smallint NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD CONSTRAINT "chk_inspections_attempt_number"
      CHECK ("attempt_number" IN (1, 2))
    `);

    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD CONSTRAINT "uq_inspections_application_attempt"
      UNIQUE ("application_id", "attempt_number")
    `);

    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD CONSTRAINT "chk_inspections_state_consistency"
      CHECK (
        (
          "status" = 'PENDING'::"public"."inspection_status"
          AND "result" IS NULL
          AND "recorded_by_user_id" IS NULL
          AND "completed_at" IS NULL
          AND "failure_reason" IS NULL
        )
        OR
        (
          "status" = 'COMPLETED'::"public"."inspection_status"
          AND "result" IS NOT NULL
          AND "recorded_by_user_id" IS NOT NULL
          AND "completed_at" IS NOT NULL
        )
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD CONSTRAINT "chk_inspections_result_failure_reason"
      CHECK (
        ("result" IS NULL AND "failure_reason" IS NULL)
        OR
        (
          "result" = 'PASS'::"public"."inspection_result"
          AND "failure_reason" IS NULL
        )
        OR
        (
          "result" = 'FAIL'::"public"."inspection_result"
          AND "failure_reason" IS NOT NULL
          AND "failure_reason" = btrim("failure_reason")
          AND "failure_reason" <> ''
          AND char_length("failure_reason") <= 500
        )
      )
    `);

    await queryRunner.query(`
      CREATE FUNCTION "public"."fn_guard_completed_inspection_immutable"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF OLD."status" = 'COMPLETED'::"public"."inspection_status" THEN
          RAISE EXCEPTION
            'completed inspections are immutable; UPDATE and DELETE are not permitted'
            USING ERRCODE = 'P0001';
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trg_guard_completed_inspection_immutable"
      BEFORE UPDATE OR DELETE ON "inspections"
      FOR EACH ROW
      EXECUTE FUNCTION "public"."fn_guard_completed_inspection_immutable"()
    `);

    await queryRunner.query(`
      ALTER TABLE "renewal_application_status_history"
      ADD COLUMN "reason" character varying(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        RAISE EXCEPTION
          'Migration AddPhysicalInspectionWorkflow1786681183523 is irreversible because application_status enum evolution cannot be safely reverted'
          USING ERRCODE = 'P0001';
      END;
      $$
    `);
  }
}
