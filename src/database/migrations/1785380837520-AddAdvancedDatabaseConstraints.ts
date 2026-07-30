import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdvancedDatabaseConstraints1785380837520 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "chk_users_phone_or_email"
      CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL)
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

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_current_document_per_type"
      ON "application_documents" ("application_id", "document_type")
      WHERE "is_current" = true
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_scheduled_appointment_per_application"
      ON "appointments" ("application_id")
      WHERE "status" = 'SCHEDULED'
    `);

    await queryRunner.query(`
      ALTER TABLE "appointment_slots"
      ADD CONSTRAINT "chk_appointment_slot_capacity"
      CHECK ("capacity" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "appointment_slots"
      ADD CONSTRAINT "chk_appointment_slot_time"
      CHECK ("end_time" > "start_time")
    `);

    await queryRunner.query(`
      ALTER TABLE "application_documents"
      ADD CONSTRAINT "chk_document_version"
      CHECK ("version_number" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "application_documents"
      ADD CONSTRAINT "chk_document_file_size"
      CHECK ("file_size_bytes" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD CONSTRAINT "chk_payment_amounts"
      CHECK (
        "base_amount" >= 0
        AND "late_fee" >= 0
        AND "total_amount" >= 0
        AND "total_amount" = "base_amount" + "late_fee"
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_provider_transaction"
      ON "payments" ("provider_name", "provider_transaction_id")
      WHERE "provider_transaction_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD CONSTRAINT "chk_payments_provider_name_required"
      CHECK (
        "provider_transaction_id" IS NULL
        OR "provider_name" IS NOT NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD CONSTRAINT "fk_inspections_appointment_application"
      FOREIGN KEY ("appointment_id", "application_id")
      REFERENCES "appointments" ("id", "application_id")
      ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inspections"
      DROP CONSTRAINT "fk_inspections_appointment_application"
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "chk_payments_provider_name_required"
    `);

    await queryRunner.query(`DROP INDEX "public"."uq_provider_transaction"`);

    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP CONSTRAINT "chk_payment_amounts"
    `);

    await queryRunner.query(`
      ALTER TABLE "application_documents"
      DROP CONSTRAINT "chk_document_file_size"
    `);

    await queryRunner.query(`
      ALTER TABLE "application_documents"
      DROP CONSTRAINT "chk_document_version"
    `);

    await queryRunner.query(`
      ALTER TABLE "appointment_slots"
      DROP CONSTRAINT "chk_appointment_slot_time"
    `);

    await queryRunner.query(`
      ALTER TABLE "appointment_slots"
      DROP CONSTRAINT "chk_appointment_slot_capacity"
    `);

    await queryRunner.query(
      `DROP INDEX "public"."uq_scheduled_appointment_per_application"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."uq_current_document_per_type"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."uq_active_application_per_vehicle"`,
    );

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT "chk_users_phone_or_email"
    `);
  }
}
