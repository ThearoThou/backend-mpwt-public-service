import { ApiErrorCode } from '../common/errors/api-error-code';
import { MPWT_INSPECTION_CATEGORY_REFERENCE } from '../inspection-categories/mpwt-inspection-category-reference';
import { InspectionValidityRule } from './enums/inspection-validity-rule.enum';
import {
  applyInspectionValidity,
  determineInspectionValidity,
} from './inspection-validity';

describe('inspection validity rules', () => {
  it.each([
    [
      'new family vehicle',
      'MPWT0011524',
      4,
      InspectionValidityRule.NEW_FAMILY_VEHICLE,
    ],
    [
      'family vehicle renewal up to 4 persons',
      'MPWT0011525',
      2,
      InspectionValidityRule.FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL,
    ],
    [
      'non-commercial family vehicle renewal 5 to 9 years old',
      'MPWT0011526',
      2,
      InspectionValidityRule.FAMILY_VEHICLE_5_TO_9_PERSONS_NON_COMMERCIAL_RENEWAL,
    ],
    [
      'new commercial passenger vehicle',
      'MPWT0011535',
      2,
      InspectionValidityRule.NEW_COMMERCIAL_PASSENGER_OR_LIGHT_GOODS_VEHICLE,
    ],
    [
      'new commercial light-goods vehicle',
      'MPWT0011535',
      2,
      InspectionValidityRule.NEW_COMMERCIAL_PASSENGER_OR_LIGHT_GOODS_VEHICLE,
    ],
    [
      'new commercial light-goods vehicle up to one tonne uses the new rule',
      'MPWT0011535',
      2,
      InspectionValidityRule.NEW_COMMERCIAL_PASSENGER_OR_LIGHT_GOODS_VEHICLE,
    ],
    [
      'existing commercial goods vehicle up to one tonne',
      'MPWT0011534',
      1,
      InspectionValidityRule.COMMERCIAL_GOODS_UP_TO_ONE_TONNE_RENEWAL,
    ],
    [
      'trailer',
      'MPWT0011541',
      1,
      InspectionValidityRule.TRAILER_OR_SEMI_TRAILER,
    ],
    [
      'semi-trailer',
      'MPWT0011541',
      1,
      InspectionValidityRule.TRAILER_OR_SEMI_TRAILER,
    ],
    [
      'motor tricycle',
      'MPWT-TRICYCLE-MOTORCYCLE-TRAILER',
      1,
      InspectionValidityRule.MOTOR_TRICYCLE_OR_MOTORCYCLE_TOWING_TRAILER,
    ],
    [
      'motorcycle towing trailer',
      'MPWT-TRICYCLE-MOTORCYCLE-TRAILER',
      1,
      InspectionValidityRule.MOTOR_TRICYCLE_OR_MOTORCYCLE_TOWING_TRAILER,
    ],
    [
      'taxi/passenger vehicle with 5 to 9 seats',
      'MPWT0011527',
      1,
      InspectionValidityRule.TAXI_PASSENGER_5_TO_9_SEATS,
    ],
    [
      'passenger vehicle with 10 to 14 seats',
      'MPWT0011528',
      1,
      InspectionValidityRule.PASSENGER_10_TO_14_SEATS,
    ],
    [
      'passenger vehicle with 15 seats',
      'MPWT0011529',
      1,
      InspectionValidityRule.PASSENGER_15_SEATS,
    ],
    [
      'passenger vehicle with 16 to 20 seats',
      'MPWT0011530',
      1,
      InspectionValidityRule.PASSENGER_16_TO_20_SEATS,
    ],
    [
      'passenger vehicle with 21 or more seats',
      'MPWT0011531',
      1,
      InspectionValidityRule.PASSENGER_21_OR_MORE_SEATS,
    ],
    [
      'new non-commercial goods vehicle up to one tonne',
      'MPWT0011532',
      4,
      InspectionValidityRule.NEW_NON_COMMERCIAL_GOODS_UP_TO_ONE_TONNE,
    ],
    [
      'non-commercial goods vehicle up to one tonne renewal',
      'MPWT0011533',
      2,
      InspectionValidityRule.NON_COMMERCIAL_GOODS_UP_TO_ONE_TONNE_RENEWAL,
    ],
    [
      'new commercial heavy goods/passenger vehicle',
      'MPWT0011536',
      2,
      InspectionValidityRule.NEW_COMMERCIAL_HEAVY_GOODS_OR_PASSENGER,
    ],
    [
      'goods vehicle up to two tonnes',
      'MPWT0011537',
      1,
      InspectionValidityRule.GOODS_UP_TO_TWO_TONNES,
    ],
    [
      'goods vehicle over two to five tonnes',
      'MPWT0011538',
      1,
      InspectionValidityRule.GOODS_OVER_TWO_TO_FIVE_TONNES,
    ],
    [
      'tractor or goods vehicle over five to ten tonnes',
      'MPWT0011539',
      1,
      InspectionValidityRule.TRACTOR_OR_GOODS_OVER_FIVE_TO_TEN_TONNES,
    ],
    [
      'tractor or goods vehicle over ten tonnes',
      'MPWT0011540',
      1,
      InspectionValidityRule.TRACTOR_OR_GOODS_OVER_TEN_TONNES,
    ],
  ] as const)('classifies %s', (_case, categoryCode, years, rule) => {
    expect(determineInspectionValidity(categoryCode)).toEqual({ years, rule });
  });

  it('rejects an unsupported category with a dedicated safe domain error', () => {
    expect.assertions(1);
    try {
      determineInspectionValidity('MPWT-UNKNOWN-FUTURE-CATEGORY');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: ApiErrorCode.INSPECTION_VALIDITY_RULE_UNSUPPORTED,
        status: 409,
      });
    }
  });

  it('resolves every active configured MPWT inspection category using its reference duration', () => {
    const activeCategories = MPWT_INSPECTION_CATEGORY_REFERENCE.filter(
      (category) => category.isActive,
    );

    expect(activeCategories).toHaveLength(19);
    for (const category of activeCategories) {
      expect(determineInspectionValidity(category.code).years).toBe(
        category.validityMonths / 12,
      );
    }
  });

  it('uses the effective Cambodia completion date and calendar-year arithmetic', () => {
    expect(
      applyInspectionValidity(
        'MPWT0011525',
        new Date('2028-02-29T17:30:00.000Z'),
      ),
    ).toEqual({
      years: 2,
      rule: InspectionValidityRule.FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL,
      validUntil: '2030-03-01',
    });

    expect(
      applyInspectionValidity(
        'MPWT0011525',
        new Date('2028-02-29T12:00:00.000Z'),
      ).validUntil,
    ).toBe('2030-02-28');
  });
});
