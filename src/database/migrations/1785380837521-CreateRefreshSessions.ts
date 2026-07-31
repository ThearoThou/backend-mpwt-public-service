import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshSessions1785380837521 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(255) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "revocation_reason" character varying(100),
        "reuse_detected_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_refresh_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "chk_refresh_sessions_token_hash_not_blank"
          CHECK (btrim("token_hash") <> ''),
        CONSTRAINT "chk_refresh_sessions_expires_after_created"
          CHECK ("expires_at" > "created_at"),
        CONSTRAINT "chk_refresh_sessions_last_used_after_created"
          CHECK ("last_used_at" IS NULL OR "last_used_at" >= "created_at"),
        CONSTRAINT "chk_refresh_sessions_revoked_after_created"
          CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at"),
        CONSTRAINT "chk_refresh_sessions_reuse_detected_after_created"
          CHECK (
            "reuse_detected_at" IS NULL
            OR "reuse_detected_at" >= "created_at"
          ),
        CONSTRAINT "chk_refresh_sessions_reuse_requires_revocation"
          CHECK ("reuse_detected_at" IS NULL OR "revoked_at" IS NOT NULL),
        CONSTRAINT "chk_refresh_sessions_revocation_reason_pair"
          CHECK (
            ("revoked_at" IS NULL AND "revocation_reason" IS NULL)
            OR ("revoked_at" IS NOT NULL AND "revocation_reason" IS NOT NULL)
          ),
        CONSTRAINT "fk_refresh_sessions_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_refresh_sessions_user_active"
      ON "refresh_sessions" ("user_id", "expires_at")
      WHERE "revoked_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_refresh_sessions_expires_at"
      ON "refresh_sessions" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
  }
}
