import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTechnicalInspectionCertificates1788500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "technical_inspection_certificates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "inspection_id" uuid NOT NULL,
        "certificate_number" character varying(100) NOT NULL,
        "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "issued_by_user_id" uuid,
        "artifact_file_key" character varying(500) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_technical_inspection_certificates" PRIMARY KEY ("id"),
        CONSTRAINT "uq_technical_inspection_certificates_application" UNIQUE ("application_id"),
        CONSTRAINT "uq_technical_inspection_certificates_inspection" UNIQUE ("inspection_id"),
        CONSTRAINT "uq_technical_inspection_certificates_number" UNIQUE ("certificate_number"),
        CONSTRAINT "uq_technical_inspection_certificates_artifact" UNIQUE ("artifact_file_key"),
        CONSTRAINT "chk_technical_inspection_certificates_number_trimmed_nonempty"
          CHECK (
            "certificate_number" = btrim("certificate_number")
            AND "certificate_number" <> ''
          ),
        CONSTRAINT "fk_technical_inspection_certificates_application"
          FOREIGN KEY ("application_id")
          REFERENCES "renewal_applications" ("id")
          ON DELETE RESTRICT
          ON UPDATE RESTRICT,
        CONSTRAINT "fk_technical_inspection_certificates_inspection"
          FOREIGN KEY ("inspection_id")
          REFERENCES "inspections" ("id")
          ON DELETE RESTRICT
          ON UPDATE RESTRICT,
        CONSTRAINT "fk_technical_inspection_certificates_issuer"
          FOREIGN KEY ("issued_by_user_id")
          REFERENCES "users" ("id")
          ON DELETE SET NULL
          ON UPDATE RESTRICT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "technical_inspection_certificates"`);
  }
}
