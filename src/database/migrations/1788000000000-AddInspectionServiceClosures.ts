import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInspectionServiceClosures1788000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inspection_service_closures" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "closure_date" date NOT NULL,
        "reason_kh" character varying(500) NOT NULL,
        "reason_en" character varying(500) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inspection_service_closures" PRIMARY KEY ("id"),
        CONSTRAINT "uq_inspection_service_closures_closure_date" UNIQUE ("closure_date")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "inspection_service_closures"');
  }
}
