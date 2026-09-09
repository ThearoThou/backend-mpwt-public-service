import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInspectionValidity1788300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD COLUMN "valid_until" date,
      ADD COLUMN "validity_rule" character varying(60)
    `);
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD CONSTRAINT "chk_inspections_validity_pair"
      CHECK (
        ("valid_until" IS NULL AND "validity_rule" IS NULL)
        OR
        (
          "valid_until" IS NOT NULL
          AND "validity_rule" IS NOT NULL
          AND "validity_rule" IN (
            'NEW_FAMILY_VEHICLE',
            'FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL',
            'FAMILY_VEHICLE_5_TO_9_PERSONS_NON_COMMERCIAL_RENEWAL',
            'NEW_COMMERCIAL_PASSENGER_OR_LIGHT_GOODS_VEHICLE',
            'COMMERCIAL_GOODS_UP_TO_ONE_TONNE_RENEWAL',
            'TRAILER_OR_SEMI_TRAILER',
            'MOTOR_TRICYCLE_OR_MOTORCYCLE_TOWING_TRAILER',
            'TAXI_PASSENGER_5_TO_9_SEATS',
            'PASSENGER_10_TO_14_SEATS',
            'PASSENGER_15_SEATS',
            'PASSENGER_16_TO_20_SEATS',
            'PASSENGER_21_OR_MORE_SEATS',
            'NEW_NON_COMMERCIAL_GOODS_UP_TO_ONE_TONNE',
            'NON_COMMERCIAL_GOODS_UP_TO_ONE_TONNE_RENEWAL',
            'NEW_COMMERCIAL_HEAVY_GOODS_OR_PASSENGER',
            'GOODS_UP_TO_TWO_TONNES',
            'GOODS_OVER_TWO_TO_FIVE_TONNES',
            'TRACTOR_OR_GOODS_OVER_FIVE_TO_TEN_TONNES',
            'TRACTOR_OR_GOODS_OVER_TEN_TONNES'
          )
          AND "status" = 'COMPLETED'::"public"."inspection_status"
          AND "result" = 'PASS'::"public"."inspection_result"
        )
      )
    `);
  }

  public down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Migration AddInspectionValidity1788300000000 is irreversible because frozen historical inspection validity must be retained',
      ),
    );
  }
}
