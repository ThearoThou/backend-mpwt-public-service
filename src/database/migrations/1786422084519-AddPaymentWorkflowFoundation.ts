import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentWorkflowFoundation1786422084519 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "payments"
        ) THEN
          RAISE EXCEPTION
            'Cannot apply payment workflow foundation: existing payments cannot be safely assigned previous_inspection_expiry_date and late_days'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN "previous_inspection_expiry_date" date NOT NULL,
      ADD COLUMN "late_days" integer NOT NULL,
      ADD COLUMN "inspection_fee_khr" numeric(12,2) NOT NULL,
      ADD COLUMN "service_fee_khr" numeric(12,2) NOT NULL,
      ADD COLUMN "inspection_sheet_file_key" character varying(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD CONSTRAINT "chk_payments_late_days_nonnegative"
      CHECK ("late_days" >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD CONSTRAINT "chk_payments_inspection_fee_nonnegative"
      CHECK ("inspection_fee_khr" >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD CONSTRAINT "chk_payments_service_fee_nonnegative"
      CHECK ("service_fee_khr" >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD CONSTRAINT "chk_payments_base_amount_fee_components"
      CHECK ("base_amount" = "inspection_fee_khr" + "service_fee_khr")
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "payment_id" uuid NOT NULL,
        "from_status" "public"."payment_status" NOT NULL,
        "to_status" "public"."payment_status" NOT NULL,
        "changed_by_user_id" uuid,
        "reason" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_payment_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "chk_payment_status_history_status_transition"
          CHECK ("from_status" <> "to_status")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_status_history"
      ADD CONSTRAINT "fk_payment_status_history_payment"
      FOREIGN KEY ("payment_id")
      REFERENCES "payments" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_status_history"
      ADD CONSTRAINT "fk_payment_status_history_changed_by_user"
      FOREIGN KEY ("changed_by_user_id")
      REFERENCES "users" ("id")
      ON DELETE SET NULL
      ON UPDATE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_payment_status_history_payment_created"
      ON "payment_status_history" ("payment_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_payment_status_history_changed_by_user"
      ON "payment_status_history" ("changed_by_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_payment_status_history_changed_by_user"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."idx_payment_status_history_payment_created"`,
    );

    await queryRunner.query(`
      ALTER TABLE "payment_status_history"
      DROP CONSTRAINT "fk_payment_status_history_changed_by_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_status_history"
      DROP CONSTRAINT "fk_payment_status_history_payment"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_status_history"
      DROP CONSTRAINT "chk_payment_status_history_status_transition"
    `);

    await queryRunner.query(`DROP TABLE "payment_status_history"`);

    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "chk_payments_late_days_nonnegative"
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "chk_payments_base_amount_fee_components"
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "chk_payments_service_fee_nonnegative"
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "chk_payments_inspection_fee_nonnegative"
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP COLUMN "inspection_sheet_file_key",
      DROP COLUMN "service_fee_khr",
      DROP COLUMN "inspection_fee_khr",
      DROP COLUMN "late_days",
      DROP COLUMN "previous_inspection_expiry_date"
    `);
  }
}
