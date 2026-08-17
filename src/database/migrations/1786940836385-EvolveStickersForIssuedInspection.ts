import { MigrationInterface, QueryRunner } from 'typeorm';

export class EvolveStickersForIssuedInspection1786940836385 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "stickers") THEN
          RAISE EXCEPTION
            'Cannot evolve stickers for issued inspections: existing sticker rows require an explicit migration plan'
            USING ERRCODE = 'P0001';
        END IF;
      END;
      $$
    `);

    await queryRunner.query(`DROP INDEX "public"."idx_stickers_status"`);

    await queryRunner.query(`
      ALTER TABLE "stickers"
      DROP CONSTRAINT "FK_80895b54aab0c858e783d9722fe",
      DROP CONSTRAINT "FK_1e6d9ce40174aacd279bb7d8ca3",
      DROP CONSTRAINT "FK_c27c7ef3c03b81d67642af8def0",
      DROP CONSTRAINT "REL_80895b54aab0c858e783d9722f",
      DROP CONSTRAINT "UQ_cfca05f67fd65870a156eef99d6"
    `);

    await queryRunner.query(`
      ALTER TABLE "stickers"
      ADD COLUMN "inspection_id" uuid NOT NULL,
      ALTER COLUMN "sticker_number" SET NOT NULL,
      ALTER COLUMN "issued_at" SET NOT NULL,
      DROP COLUMN "status",
      DROP COLUMN "certificate_number",
      DROP COLUMN "certificate_file_key",
      DROP COLUMN "ready_at",
      DROP COLUMN "marked_ready_by_user_id",
      DROP COLUMN "pickup_recipient_name",
      DROP COLUMN "pickup_notes"
    `);

    await queryRunner.query(`DROP TYPE "public"."sticker_status"`);

    await queryRunner.query(`
      ALTER TABLE "stickers"
      ADD CONSTRAINT "uq_stickers_application"
        UNIQUE ("application_id"),
      ADD CONSTRAINT "uq_stickers_inspection"
        UNIQUE ("inspection_id"),
      ADD CONSTRAINT "uq_stickers_sticker_number"
        UNIQUE ("sticker_number"),
      ADD CONSTRAINT "chk_stickers_sticker_number_trimmed_nonempty"
        CHECK (
          "sticker_number" = btrim("sticker_number")
          AND "sticker_number" <> ''
        ),
      ADD CONSTRAINT "fk_stickers_application"
        FOREIGN KEY ("application_id")
        REFERENCES "renewal_applications" ("id")
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
      ADD CONSTRAINT "fk_stickers_inspection"
        FOREIGN KEY ("inspection_id")
        REFERENCES "inspections" ("id")
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
      ADD CONSTRAINT "fk_stickers_issued_by_user"
        FOREIGN KEY ("issued_by_user_id")
        REFERENCES "users" ("id")
        ON DELETE SET NULL
        ON UPDATE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_stickers_issued_at"
      ON "stickers" ("issued_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        RAISE EXCEPTION
          'Migration EvolveStickersForIssuedInspection1786940836385 is irreversible because removed sticker placeholder and pickup fields cannot be restored safely'
          USING ERRCODE = 'P0001';
      END;
      $$
    `);
  }
}
