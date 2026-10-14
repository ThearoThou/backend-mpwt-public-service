import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Removes enum values which were never part of the final citizen workflow. */
export class RemoveLegacyWorkflowStatuses1788700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM renewal_applications WHERE status::text IN ('APPOINTMENT_SELECTION_REQUIRED', 'REINSPECTION_REQUIRED'))
          OR EXISTS (SELECT 1 FROM renewal_application_status_history WHERE previous_status::text IN ('APPOINTMENT_SELECTION_REQUIRED', 'REINSPECTION_REQUIRED') OR new_status::text IN ('APPOINTMENT_SELECTION_REQUIRED', 'REINSPECTION_REQUIRED'))
          OR EXISTS (SELECT 1 FROM payments WHERE status::text = 'FAILED')
          OR EXISTS (SELECT 1 FROM payment_status_history WHERE from_status::text = 'FAILED' OR to_status::text = 'FAILED') THEN
          RAISE EXCEPTION 'Cannot remove legacy workflow statuses: live or history rows still use APPOINTMENT_SELECTION_REQUIRED, REINSPECTION_REQUIRED, or FAILED'
            USING ERRCODE = 'P0001';
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS public.uq_unfinished_application_per_vehicle`,
    );
    await queryRunner.query(
      `ALTER TABLE renewal_applications ALTER COLUMN status DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE renewal_application_status_history DROP CONSTRAINT IF EXISTS chk_renewal_application_status_history_transition`,
    );
    await queryRunner.query(
      `ALTER TYPE public.application_status RENAME TO application_status_legacy_cleanup`,
    );
    await queryRunner.query(
      `CREATE TYPE public.application_status AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUIRED', 'APPROVED', 'REJECTED', 'INSPECTION_FAILED', 'EXPIRED', 'CANCELLED', 'COMPLETED')`,
    );
    await queryRunner.query(
      `ALTER TABLE renewal_applications ALTER COLUMN status TYPE public.application_status USING status::text::public.application_status`,
    );
    await queryRunner.query(
      `ALTER TABLE renewal_application_status_history ALTER COLUMN previous_status TYPE public.application_status USING previous_status::text::public.application_status`,
    );
    await queryRunner.query(
      `ALTER TABLE renewal_application_status_history ALTER COLUMN new_status TYPE public.application_status USING new_status::text::public.application_status`,
    );
    await queryRunner.query(
      `ALTER TABLE renewal_applications ALTER COLUMN status SET DEFAULT 'DRAFT'::public.application_status`,
    );
    await queryRunner.query(`
      ALTER TABLE renewal_application_status_history
      ADD CONSTRAINT chk_renewal_application_status_history_transition
      CHECK (
        (previous_status IS NULL AND new_status = 'DRAFT'::public.application_status)
        OR (previous_status IS NOT NULL AND previous_status <> new_status)
      )
    `);
    await queryRunner.query(
      `DROP TYPE public.application_status_legacy_cleanup`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_unfinished_application_per_vehicle ON renewal_applications (vehicle_id) WHERE status IN ('DRAFT'::public.application_status, 'SUBMITTED'::public.application_status, 'UNDER_REVIEW'::public.application_status, 'CORRECTION_REQUIRED'::public.application_status, 'APPROVED'::public.application_status)`,
    );

    await queryRunner.query(
      `ALTER TABLE payments ALTER COLUMN status DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE payment_status_history DROP CONSTRAINT IF EXISTS chk_payment_status_history_status_transition`,
    );
    await queryRunner.query(
      `ALTER TYPE public.payment_status RENAME TO payment_status_legacy_cleanup`,
    );
    await queryRunner.query(
      `CREATE TYPE public.payment_status AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE payments ALTER COLUMN status TYPE public.payment_status USING status::text::public.payment_status`,
    );
    await queryRunner.query(
      `ALTER TABLE payment_status_history ALTER COLUMN from_status TYPE public.payment_status USING from_status::text::public.payment_status`,
    );
    await queryRunner.query(
      `ALTER TABLE payment_status_history ALTER COLUMN to_status TYPE public.payment_status USING to_status::text::public.payment_status`,
    );
    await queryRunner.query(
      `ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'PENDING'::public.payment_status`,
    );
    await queryRunner.query(`
      ALTER TABLE payment_status_history
      ADD CONSTRAINT chk_payment_status_history_status_transition
      CHECK (from_status <> to_status)
    `);
    await queryRunner.query(`DROP TYPE public.payment_status_legacy_cleanup`);
  }

  public down(_queryRunner: QueryRunner): Promise<void> {
    void _queryRunner;
    return Promise.reject(
      new Error('RemoveLegacyWorkflowStatuses1788700000000 is forward-only'),
    );
  }
}
