import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChangeEmailVerificationPurpose1792000000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."verification_purpose" ADD VALUE IF NOT EXISTS 'CHANGE_EMAIL'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL enum values cannot be safely removed while verification records exist.
  }
}
