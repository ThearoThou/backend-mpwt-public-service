import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasswordResetAuthorizations1788200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_authorizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_password_reset_authorizations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_password_reset_authorizations_token_hash"
          UNIQUE ("token_hash"),
        CONSTRAINT "chk_password_reset_authorizations_token_hash"
          CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_password_reset_authorizations_expires_after_created"
          CHECK ("expires_at" > "created_at"),
        CONSTRAINT "chk_password_reset_authorizations_used_after_created"
          CHECK ("used_at" IS NULL OR "used_at" >= "created_at"),
        CONSTRAINT "fk_password_reset_authorizations_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_password_reset_authorizations_user_active"
      ON "password_reset_authorizations" ("user_id", "expires_at")
      WHERE "used_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_password_reset_authorizations_expires_at"
      ON "password_reset_authorizations" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "password_reset_authorizations"`);
  }
}
