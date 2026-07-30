import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1785378252215 implements MigrationInterface {
  name = 'InitialSchema1785378252215';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."document_type" AS ENUM('VEHICLE_REGISTRATION_CARD', 'PREVIOUS_INSPECTION_CERTIFICATE', 'NATIONAL_ID')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "application_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "document_type" "public"."document_type" NOT NULL, "version_number" integer NOT NULL DEFAULT '1', "is_current" boolean NOT NULL DEFAULT true, "replaces_document_id" uuid, "uploaded_by_user_id" uuid NOT NULL, "storage_key" character varying(500) NOT NULL, "original_file_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "file_size_bytes" bigint NOT NULL, "status" "public"."document_status" NOT NULL DEFAULT 'PENDING', "reviewed_by_user_id" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" text, "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_592142aa992e003beadf1409e9e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_application_documents_application_status" ON "application_documents"  ("application_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_application_documents_application_document_type_version" ON "application_documents"  ("application_id", "document_type", "version_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_actor_type" AS ENUM('USER', 'SYSTEM')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_type" "public"."audit_actor_type" NOT NULL, "actor_user_id" uuid, "application_id" uuid, "action" character varying(100) NOT NULL, "entity_type" character varying(100) NOT NULL, "entity_id" uuid, "description" text, "old_values" jsonb, "new_values" jsonb, "ip_address" inet, "user_agent" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_actor_created" ON "audit_logs"  ("actor_user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_entity_created" ON "audit_logs"  ("entity_type", "entity_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_application_created" ON "audit_logs"  ("application_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."verification_purpose" AS ENUM('REGISTER_ACCOUNT', 'RESET_PASSWORD', 'CHANGE_PHONE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "verification_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "destination" character varying(255) NOT NULL, "purpose" "public"."verification_purpose" NOT NULL, "code_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "attempt_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18741b6b8bf1680dbf5057421d7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e2aa1f0c94500d4aa891eaf32f" ON "verification_codes"  ("destination", "purpose", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "inspection_stations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(30) NOT NULL, "name_kh" character varying(200) NOT NULL, "name_en" character varying(200) NOT NULL, "province" character varying(100) NOT NULL, "address" text NOT NULL, "phone" character varying(20), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_121d816e5a07ab880abb67c27ef" UNIQUE ("code"), CONSTRAINT "PK_d8cb4a72880aa31f13f02323d9e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."appointment_slot_status" AS ENUM('OPEN', 'CLOSED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "appointment_slots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "station_id" uuid NOT NULL, "slot_date" date NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "capacity" smallint NOT NULL DEFAULT '1', "status" "public"."appointment_slot_status" NOT NULL DEFAULT 'OPEN', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_667e57c39f789b906bd595a2e2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_appointment_slots_station_date_status" ON "appointment_slots"  ("station_id", "slot_date", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_appointment_slots_station_date_start_end" ON "appointment_slots"  ("station_id", "slot_date", "start_time", "end_time") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."appointment_status" AS ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')`,
    );
    await queryRunner.query(
      `CREATE TABLE "appointments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "slot_id" uuid NOT NULL, "status" "public"."appointment_status" NOT NULL DEFAULT 'SCHEDULED', "booked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancelled_by_user_id" uuid, "cancellation_reason" text, "no_show_marked_at" TIMESTAMP WITH TIME ZONE, "no_show_marked_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_appointments_slot_status" ON "appointments"  ("slot_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_appointments_application_status" ON "appointments"  ("application_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_appointments_id_application" ON "appointments"  ("id", "application_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."inspection_status" AS ENUM('PENDING', 'COMPLETED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."inspection_result" AS ENUM('PASS', 'FAIL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "inspections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "appointment_id" uuid NOT NULL, "status" "public"."inspection_status" NOT NULL DEFAULT 'PENDING', "result" "public"."inspection_result", "recorded_by_user_id" uuid, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "failure_reason" text, "notes" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_572ebcefff16193088f271b9d9" UNIQUE ("appointment_id"), CONSTRAINT "PK_a484980015782324454d8c88abe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_inspections_result" ON "inspections"  ("result") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_inspections_status" ON "inspections"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_inspections_application_created" ON "inspections"  ("application_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_method" AS ENUM('PAY_AT_STATION', 'BANK_QR', 'BANK_CARD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'CONFIRMED', 'FAILED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "invoice_number" character varying(50) NOT NULL, "receipt_number" character varying(50), "method" "public"."payment_method" NOT NULL, "status" "public"."payment_status" NOT NULL DEFAULT 'PENDING', "base_amount" numeric(12,2) NOT NULL, "late_fee" numeric(12,2) NOT NULL DEFAULT '0', "total_amount" numeric(12,2) NOT NULL, "currency" character(3) NOT NULL DEFAULT 'KHR', "payment_reference" character varying(100), "provider_name" character varying(100), "provider_transaction_id" character varying(150), "confirmed_by_user_id" uuid, "confirmed_at" TIMESTAMP WITH TIME ZONE, "failed_at" TIMESTAMP WITH TIME ZONE, "failure_reason" text, "rejected_at" TIMESTAMP WITH TIME ZONE, "rejected_by_user_id" uuid, "rejection_reason" text, "invoice_issued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "invoice_file_key" character varying(500), "receipt_file_key" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_196649f20ae02c5933b0d7c2dad" UNIQUE ("invoice_number"), CONSTRAINT "UQ_a6659e5eb1bf3b467c819e7f167" UNIQUE ("receipt_number"), CONSTRAINT "REL_3b379ebb0e5d8ac17f998b932e" UNIQUE ("application_id"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_method" ON "payments"  ("method") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_status" ON "payments"  ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type" AS ENUM('APPLICATION_SUBMITTED', 'REVIEW_STARTED', 'CORRECTION_REQUIRED', 'DOCUMENTS_APPROVED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'APPOINTMENT_SCHEDULED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_REMINDER', 'APPOINTMENT_NO_SHOW', 'READY_FOR_INSPECTION', 'INSPECTION_PASSED', 'INSPECTION_FAILED', 'STICKER_READY', 'APPLICATION_COMPLETED', 'APPLICATION_CANCELLED', 'SYSTEM_ANNOUNCEMENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'EMAIL', 'SMS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_delivery_status" AS ENUM('PENDING', 'SENT', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "recipient_user_id" uuid NOT NULL, "application_id" uuid, "type" "public"."notification_type" NOT NULL, "channel" "public"."notification_channel" NOT NULL DEFAULT 'IN_APP', "delivery_status" "public"."notification_delivery_status" NOT NULL DEFAULT 'SENT', "title" character varying(255) NOT NULL, "message" text NOT NULL, "data" jsonb, "created_by_user_id" uuid, "sent_at" TIMESTAMP WITH TIME ZONE, "failed_at" TIMESTAMP WITH TIME ZONE, "failure_reason" text, "is_read" boolean NOT NULL DEFAULT false, "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_application_created" ON "notifications"  ("application_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_recipient_read_created" ON "notifications"  ("recipient_user_id", "is_read", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sticker_status" AS ENUM('NOT_READY', 'READY_FOR_PICKUP', 'ISSUED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "stickers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "status" "public"."sticker_status" NOT NULL DEFAULT 'NOT_READY', "sticker_number" character varying(100), "certificate_number" character varying(100), "certificate_file_key" character varying(500), "ready_at" TIMESTAMP WITH TIME ZONE, "marked_ready_by_user_id" uuid, "issued_at" TIMESTAMP WITH TIME ZONE, "issued_by_user_id" uuid, "pickup_recipient_name" character varying(150), "pickup_notes" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_cfca05f67fd65870a156eef99d6" UNIQUE ("sticker_number"), CONSTRAINT "UQ_2dddc6e93b175646b5ae457b25f" UNIQUE ("certificate_number"), CONSTRAINT "REL_80895b54aab0c858e783d9722f" UNIQUE ("application_id"), CONSTRAINT "PK_e1dafa4063a5532645cc2810374" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stickers_status" ON "stickers"  ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "linked_citizen_id" uuid, "registration_number" character varying(50) NOT NULL, "plate_number" character varying(30) NOT NULL, "plate_province" character varying(100) NOT NULL, "plate_type" character varying(50) NOT NULL, "vehicle_type" character varying(50) NOT NULL, "make" character varying(100) NOT NULL, "model" character varying(100) NOT NULL, "manufacture_year" smallint, "chassis_number" character varying(100) NOT NULL, "first_registration_date" date NOT NULL, "last_inspection_date" date, "inspection_expiry_date" date NOT NULL, "registered_owner_name_kh" character varying(150) NOT NULL, "registered_owner_name_en" character varying(150) NOT NULL, "registered_owner_phone" character varying(20) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2abf18fae2b9477bc1927675311" UNIQUE ("registration_number"), CONSTRAINT "UQ_90d5b70f93e2d5e4517020c2dff" UNIQUE ("chassis_number"), CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d710663ba30b652bc92ac52f0c" ON "vehicles"  ("plate_province", "plate_type", "plate_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "citizen_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "name_kh" character varying(150) NOT NULL, "name_en" character varying(150) NOT NULL, "national_id_number" character varying(50), "address" text, "profile_image_key" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_aa30876112d7d4c1ab2d9e7c6c9" UNIQUE ("national_id_number"), CONSTRAINT "REL_74180041ad4437e4b389830a81" UNIQUE ("user_id"), CONSTRAINT "PK_40611f4ad750c47bd2744694bbd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_role" AS ENUM('CITIZEN', 'ADMIN', 'STAFF')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_status" AS ENUM('PENDING_VERIFICATION', 'ACTIVE', 'DISABLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "role" "public"."user_role" NOT NULL DEFAULT 'CITIZEN', "status" "public"."user_status" NOT NULL DEFAULT 'PENDING_VERIFICATION', "phone" character varying(20), "email" character varying(255), "password_hash" character varying(255) NOT NULL, "phone_verified_at" TIMESTAMP WITH TIME ZONE, "email_verified_at" TIMESTAMP WITH TIME ZONE, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_a000cca60bcf04454e727699490" UNIQUE ("phone"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."application_status" AS ENUM('SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUIRED', 'READY_FOR_INSPECTION', 'INSPECTION_FAILED', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "renewal_applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference_number" character varying(50) NOT NULL, "citizen_id" uuid NOT NULL, "vehicle_id" uuid NOT NULL, "status" "public"."application_status" NOT NULL DEFAULT 'SUBMITTED', "applicant_snapshot" jsonb NOT NULL, "vehicle_snapshot" jsonb NOT NULL, "current_correction_reason" text, "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "review_started_at" TIMESTAMP WITH TIME ZONE, "ready_for_inspection_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancelled_by_user_id" uuid, "cancellation_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1a269a6b188ab66ed1ebc22b0be" UNIQUE ("reference_number"), CONSTRAINT "PK_78b9b01589fb42372f876941e40" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_renewal_applications_status" ON "renewal_applications"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_renewal_applications_vehicle_submitted_at" ON "renewal_applications"  ("vehicle_id", "submitted_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_renewal_applications_citizen_submitted_at" ON "renewal_applications"  ("citizen_id", "submitted_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."timeline_event_type" AS ENUM('APPLICATION_SUBMITTED', 'REVIEW_STARTED', 'CORRECTION_REQUIRED', 'CORRECTION_RESUBMITTED', 'DOCUMENTS_APPROVED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'APPOINTMENT_SCHEDULED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_NO_SHOW', 'READY_FOR_INSPECTION', 'INSPECTION_PASSED', 'INSPECTION_FAILED', 'STICKER_PREPARING', 'STICKER_READY', 'STICKER_ISSUED', 'APPLICATION_COMPLETED', 'APPLICATION_CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "application_timeline_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "application_id" uuid NOT NULL, "event_type" "public"."timeline_event_type" NOT NULL, "title" character varying(255) NOT NULL, "message" text, "actor_user_id" uuid, "visible_to_citizen" boolean NOT NULL DEFAULT true, "metadata" jsonb, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d5740e9540bdda20175b2686154" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_timeline_application_visible_occurred" ON "application_timeline_events"  ("application_id", "visible_to_citizen", "occurred_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_timeline_application_occurred" ON "application_timeline_events"  ("application_id", "occurred_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" ADD CONSTRAINT "FK_9ad8ab815e842d67e9aaec900cb" FOREIGN KEY ("application_id") REFERENCES "renewal_applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" ADD CONSTRAINT "FK_d9af0254f7efae9da2693aa4742" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" ADD CONSTRAINT "FK_0fe03681b334256703eb84219ba" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" ADD CONSTRAINT "FK_5e03b1c78c991240bc4eae02183" FOREIGN KEY ("replaces_document_id") REFERENCES "application_documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_f160d97a931844109de9d04228f" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_e64c07c384f813ed88b30316272" FOREIGN KEY ("application_id") REFERENCES "renewal_applications"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" ADD CONSTRAINT "FK_0a53c41a810420ee446082ce6c6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointment_slots" ADD CONSTRAINT "FK_89c035ca139f732036d4a648b9e" FOREIGN KEY ("station_id") REFERENCES "inspection_stations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_ea1002cd0a41822ca930cb1c7e5" FOREIGN KEY ("application_id") REFERENCES "renewal_applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_b1ccdd43ac8ccbb787c68a64a13" FOREIGN KEY ("slot_id") REFERENCES "appointment_slots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_f989063890cd83f0e7652a5de45" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_89c8373a12d9beae36102216b09" FOREIGN KEY ("no_show_marked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD CONSTRAINT "FK_f255b06d9aa8dfd89e147742723" FOREIGN KEY ("application_id") REFERENCES "renewal_applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD CONSTRAINT "FK_572ebcefff16193088f271b9d98" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD CONSTRAINT "FK_ad5e97202348d01c9ee4851b67d" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_3b379ebb0e5d8ac17f998b932e7" FOREIGN KEY ("application_id") REFERENCES "renewal_applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_d11985ac51d0104779148528b7b" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_9464a28484ff27338e4eb98dcb2" FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_2726bde496d82b6401532ab1477" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_dd75186e413a1f6e0d1ef8e1214" FOREIGN KEY ("application_id") REFERENCES "renewal_applications"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_0af187ad618f397cf2a0e393276" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stickers" ADD CONSTRAINT "FK_80895b54aab0c858e783d9722fe" FOREIGN KEY ("application_id") REFERENCES "renewal_applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stickers" ADD CONSTRAINT "FK_1e6d9ce40174aacd279bb7d8ca3" FOREIGN KEY ("marked_ready_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stickers" ADD CONSTRAINT "FK_c27c7ef3c03b81d67642af8def0" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "FK_2bbcffac87540842b672d79f3ba" FOREIGN KEY ("linked_citizen_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "citizen_profiles" ADD CONSTRAINT "FK_74180041ad4437e4b389830a81a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "renewal_applications" ADD CONSTRAINT "FK_c84f3f2e9ec197ad80eb6a6f83d" FOREIGN KEY ("citizen_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "renewal_applications" ADD CONSTRAINT "FK_b3cb416fe563ac49b11f8bb4d8b" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "renewal_applications" ADD CONSTRAINT "FK_557393d26f8ac9b03c84744e9bf" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_timeline_events" ADD CONSTRAINT "FK_27860d3a56abb9d4d4d6e0802df" FOREIGN KEY ("application_id") REFERENCES "renewal_applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_timeline_events" ADD CONSTRAINT "FK_7195522fa3d3188add4b021e132" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_timeline_events" DROP CONSTRAINT "FK_7195522fa3d3188add4b021e132"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_timeline_events" DROP CONSTRAINT "FK_27860d3a56abb9d4d4d6e0802df"`,
    );
    await queryRunner.query(
      `ALTER TABLE "renewal_applications" DROP CONSTRAINT "FK_557393d26f8ac9b03c84744e9bf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "renewal_applications" DROP CONSTRAINT "FK_b3cb416fe563ac49b11f8bb4d8b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "renewal_applications" DROP CONSTRAINT "FK_c84f3f2e9ec197ad80eb6a6f83d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "citizen_profiles" DROP CONSTRAINT "FK_74180041ad4437e4b389830a81a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" DROP CONSTRAINT "FK_2bbcffac87540842b672d79f3ba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stickers" DROP CONSTRAINT "FK_c27c7ef3c03b81d67642af8def0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stickers" DROP CONSTRAINT "FK_1e6d9ce40174aacd279bb7d8ca3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stickers" DROP CONSTRAINT "FK_80895b54aab0c858e783d9722fe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_0af187ad618f397cf2a0e393276"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_dd75186e413a1f6e0d1ef8e1214"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_2726bde496d82b6401532ab1477"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_9464a28484ff27338e4eb98dcb2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_d11985ac51d0104779148528b7b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_3b379ebb0e5d8ac17f998b932e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT "FK_ad5e97202348d01c9ee4851b67d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT "FK_572ebcefff16193088f271b9d98"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT "FK_f255b06d9aa8dfd89e147742723"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_89c8373a12d9beae36102216b09"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_f989063890cd83f0e7652a5de45"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_b1ccdd43ac8ccbb787c68a64a13"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_ea1002cd0a41822ca930cb1c7e5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointment_slots" DROP CONSTRAINT "FK_89c035ca139f732036d4a648b9e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "verification_codes" DROP CONSTRAINT "FK_0a53c41a810420ee446082ce6c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_e64c07c384f813ed88b30316272"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_f160d97a931844109de9d04228f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" DROP CONSTRAINT "FK_5e03b1c78c991240bc4eae02183"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" DROP CONSTRAINT "FK_0fe03681b334256703eb84219ba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" DROP CONSTRAINT "FK_d9af0254f7efae9da2693aa4742"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_documents" DROP CONSTRAINT "FK_9ad8ab815e842d67e9aaec900cb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_timeline_application_occurred"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_timeline_application_visible_occurred"`,
    );
    await queryRunner.query(`DROP TABLE "application_timeline_events"`);
    await queryRunner.query(`DROP TYPE "public"."timeline_event_type"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_renewal_applications_citizen_submitted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_renewal_applications_vehicle_submitted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_renewal_applications_status"`,
    );
    await queryRunner.query(`DROP TABLE "renewal_applications"`);
    await queryRunner.query(`DROP TYPE "public"."application_status"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_status"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
    await queryRunner.query(`DROP TABLE "citizen_profiles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d710663ba30b652bc92ac52f0c"`,
    );
    await queryRunner.query(`DROP TABLE "vehicles"`);
    await queryRunner.query(`DROP INDEX "public"."idx_stickers_status"`);
    await queryRunner.query(`DROP TABLE "stickers"`);
    await queryRunner.query(`DROP TYPE "public"."sticker_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_recipient_read_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_application_created"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(
      `DROP TYPE "public"."notification_delivery_status"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notification_channel"`);
    await queryRunner.query(`DROP TYPE "public"."notification_type"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_method"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payment_status"`);
    await queryRunner.query(`DROP TYPE "public"."payment_method"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_inspections_application_created"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_inspections_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_inspections_result"`);
    await queryRunner.query(`DROP TABLE "inspections"`);
    await queryRunner.query(`DROP TYPE "public"."inspection_result"`);
    await queryRunner.query(`DROP TYPE "public"."inspection_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_appointments_id_application"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_appointments_application_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_appointments_slot_status"`,
    );
    await queryRunner.query(`DROP TABLE "appointments"`);
    await queryRunner.query(`DROP TYPE "public"."appointment_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_appointment_slots_station_date_start_end"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_appointment_slots_station_date_status"`,
    );
    await queryRunner.query(`DROP TABLE "appointment_slots"`);
    await queryRunner.query(`DROP TYPE "public"."appointment_slot_status"`);
    await queryRunner.query(`DROP TABLE "inspection_stations"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e2aa1f0c94500d4aa891eaf32f"`,
    );
    await queryRunner.query(`DROP TABLE "verification_codes"`);
    await queryRunner.query(`DROP TYPE "public"."verification_purpose"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_audit_logs_application_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_audit_logs_entity_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_audit_logs_actor_created"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_actor_type"`);
    await queryRunner.query(
      `DROP INDEX "public"."uq_application_documents_application_document_type_version"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_application_documents_application_status"`,
    );
    await queryRunner.query(`DROP TABLE "application_documents"`);
    await queryRunner.query(`DROP TYPE "public"."document_status"`);
    await queryRunner.query(`DROP TYPE "public"."document_type"`);
  }
}
