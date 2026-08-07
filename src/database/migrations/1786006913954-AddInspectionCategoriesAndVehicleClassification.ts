import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInspectionCategoriesAndVehicleClassification1786006913954 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "vehicle_class" AS ENUM (
        'LIGHT',
        'HEAVY'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "inspection_vehicle_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(50) NOT NULL,
        "name_kh" character varying(200) NOT NULL,
        "name_en" character varying(200),
        "vehicle_class" "vehicle_class" NOT NULL,
        "validity_months" smallint NOT NULL,
        "inspection_fee_khr" numeric(12,2) NOT NULL,
        "service_fee_khr" numeric(12,2) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inspection_vehicle_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      ADD CONSTRAINT "uq_inspection_vehicle_categories_code"
      UNIQUE ("code")
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      ADD CONSTRAINT "uq_inspection_vehicle_categories_id_class"
      UNIQUE ("id", "vehicle_class")
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      ADD CONSTRAINT "chk_vehicle_categories_code_not_blank"
      CHECK (btrim("code") <> '')
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      ADD CONSTRAINT "chk_vehicle_categories_name_kh_not_blank"
      CHECK (btrim("name_kh") <> '')
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      ADD CONSTRAINT "chk_vehicle_categories_validity_positive"
      CHECK ("validity_months" > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      ADD CONSTRAINT "chk_vehicle_categories_inspection_fee_nonnegative"
      CHECK ("inspection_fee_khr" >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      ADD CONSTRAINT "chk_vehicle_categories_service_fee_nonnegative"
      CHECK ("service_fee_khr" >= 0)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_inspection_vehicle_categories_class_active"
      ON "inspection_vehicle_categories" ("vehicle_class", "is_active")
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN "vehicle_class" "vehicle_class",
      ADD COLUMN "inspection_category_id" uuid,
      ADD COLUMN "classification_verified_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "classification_verified_by" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ADD CONSTRAINT "chk_vehicles_classification_complete"
      CHECK (
        (
          "vehicle_class" IS NULL
          AND "inspection_category_id" IS NULL
          AND "classification_verified_at" IS NULL
          AND "classification_verified_by" IS NULL
        )
        OR
        (
          "vehicle_class" IS NOT NULL
          AND "inspection_category_id" IS NOT NULL
          AND "classification_verified_at" IS NOT NULL
          AND "classification_verified_by" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ADD CONSTRAINT "fk_vehicles_category_class"
      FOREIGN KEY ("inspection_category_id", "vehicle_class")
      REFERENCES "inspection_vehicle_categories" ("id", "vehicle_class")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      ADD CONSTRAINT "fk_vehicles_classification_verified_by"
      FOREIGN KEY ("classification_verified_by")
      REFERENCES "users" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_vehicles_inspection_category_class"
      ON "vehicles" ("inspection_category_id", "vehicle_class")
    `);
    await queryRunner.query(`
      CREATE TABLE "vehicle_classification_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vehicle_id" uuid NOT NULL,
        "previous_vehicle_class" "vehicle_class",
        "new_vehicle_class" "vehicle_class" NOT NULL,
        "previous_inspection_category_id" uuid,
        "new_inspection_category_id" uuid NOT NULL,
        "changed_by_admin_id" uuid NOT NULL,
        "reason" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_vehicle_classification_history" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      ADD CONSTRAINT "chk_vehicle_class_history_previous_pair"
      CHECK (
        (
          "previous_vehicle_class" IS NULL
          AND "previous_inspection_category_id" IS NULL
        )
        OR
        (
          "previous_vehicle_class" IS NOT NULL
          AND "previous_inspection_category_id" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      ADD CONSTRAINT "chk_vehicle_class_history_reason_not_blank"
      CHECK (btrim("reason") <> '')
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      ADD CONSTRAINT "fk_vehicle_class_history_vehicle"
      FOREIGN KEY ("vehicle_id")
      REFERENCES "vehicles" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      ADD CONSTRAINT "fk_vehicle_class_history_prev_category_class"
      FOREIGN KEY (
        "previous_inspection_category_id",
        "previous_vehicle_class"
      )
      REFERENCES "inspection_vehicle_categories" ("id", "vehicle_class")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      ADD CONSTRAINT "fk_vehicle_class_history_new_category_class"
      FOREIGN KEY (
        "new_inspection_category_id",
        "new_vehicle_class"
      )
      REFERENCES "inspection_vehicle_categories" ("id", "vehicle_class")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      ADD CONSTRAINT "fk_vehicle_class_history_changed_by_admin"
      FOREIGN KEY ("changed_by_admin_id")
      REFERENCES "users" ("id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_vehicle_classification_history_vehicle_created"
      ON "vehicle_classification_history" ("vehicle_id", "created_at", "id")
    `);
    await queryRunner.query(`
      CREATE FUNCTION "fn_guard_vehicle_classification_history"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION
          'vehicle_classification_history is immutable; UPDATE and DELETE are not permitted'
          USING ERRCODE = 'P0001';
        RETURN NULL;
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_guard_vehicle_classification_history"
      BEFORE UPDATE OR DELETE
      ON "vehicle_classification_history"
      FOR EACH ROW
      EXECUTE FUNCTION "fn_guard_vehicle_classification_history"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER "trg_guard_vehicle_classification_history"
      ON "vehicle_classification_history"
    `);
    await queryRunner.query(`
      DROP FUNCTION "fn_guard_vehicle_classification_history"()
    `);
    await queryRunner.query(
      `DROP INDEX "public"."idx_vehicle_classification_history_vehicle_created"`,
    );
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      DROP CONSTRAINT "fk_vehicle_class_history_changed_by_admin"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      DROP CONSTRAINT "fk_vehicle_class_history_new_category_class"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      DROP CONSTRAINT "fk_vehicle_class_history_prev_category_class"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      DROP CONSTRAINT "fk_vehicle_class_history_vehicle"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      DROP CONSTRAINT "chk_vehicle_class_history_reason_not_blank"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_classification_history"
      DROP CONSTRAINT "chk_vehicle_class_history_previous_pair"
    `);
    await queryRunner.query(`DROP TABLE "vehicle_classification_history"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_vehicles_inspection_category_class"`,
    );
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      DROP CONSTRAINT "fk_vehicles_classification_verified_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      DROP CONSTRAINT "fk_vehicles_category_class"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      DROP CONSTRAINT "chk_vehicles_classification_complete"
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicles"
      DROP COLUMN "classification_verified_by",
      DROP COLUMN "classification_verified_at",
      DROP COLUMN "inspection_category_id",
      DROP COLUMN "vehicle_class"
    `);
    await queryRunner.query(
      `DROP INDEX "public"."idx_inspection_vehicle_categories_class_active"`,
    );
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      DROP CONSTRAINT "chk_vehicle_categories_service_fee_nonnegative"
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      DROP CONSTRAINT "chk_vehicle_categories_inspection_fee_nonnegative"
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      DROP CONSTRAINT "chk_vehicle_categories_validity_positive"
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      DROP CONSTRAINT "chk_vehicle_categories_name_kh_not_blank"
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      DROP CONSTRAINT "chk_vehicle_categories_code_not_blank"
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      DROP CONSTRAINT "uq_inspection_vehicle_categories_id_class"
    `);
    await queryRunner.query(`
      ALTER TABLE "inspection_vehicle_categories"
      DROP CONSTRAINT "uq_inspection_vehicle_categories_code"
    `);
    await queryRunner.query(`DROP TABLE "inspection_vehicle_categories"`);
    await queryRunner.query(`DROP TYPE "vehicle_class"`);
  }
}
