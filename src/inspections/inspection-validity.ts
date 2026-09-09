import { HttpStatus } from '@nestjs/common';

import { addCalendarYears } from '../common/dates/calendar-date';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import {
  MPWT_INSPECTION_CATEGORY_REFERENCE,
  type MpwtInspectionValidityMonths,
} from '../inspection-categories/mpwt-inspection-category-reference';
import { InspectionValidityRule } from './enums/inspection-validity-rule.enum';

const PHNOM_PENH_TIME_ZONE = 'Asia/Phnom_Penh';

const CATEGORY_BY_CODE = new Map(
  MPWT_INSPECTION_CATEGORY_REFERENCE.map((category) => [
    category.code,
    category,
  ]),
);

const RULE_BY_CATEGORY_CODE: Readonly<Record<string, InspectionValidityRule>> =
  {
    MPWT0011524: InspectionValidityRule.NEW_FAMILY_VEHICLE,
    MPWT0011525: InspectionValidityRule.FAMILY_VEHICLE_UP_TO_4_PERSONS_RENEWAL,
    MPWT0011526:
      InspectionValidityRule.FAMILY_VEHICLE_5_TO_9_PERSONS_NON_COMMERCIAL_RENEWAL,
    MPWT0011527: InspectionValidityRule.TAXI_PASSENGER_5_TO_9_SEATS,
    MPWT0011528: InspectionValidityRule.PASSENGER_10_TO_14_SEATS,
    MPWT0011529: InspectionValidityRule.PASSENGER_15_SEATS,
    MPWT0011530: InspectionValidityRule.PASSENGER_16_TO_20_SEATS,
    MPWT0011531: InspectionValidityRule.PASSENGER_21_OR_MORE_SEATS,
    MPWT0011532:
      InspectionValidityRule.NEW_NON_COMMERCIAL_GOODS_UP_TO_ONE_TONNE,
    MPWT0011533:
      InspectionValidityRule.NON_COMMERCIAL_GOODS_UP_TO_ONE_TONNE_RENEWAL,
    MPWT0011534:
      InspectionValidityRule.COMMERCIAL_GOODS_UP_TO_ONE_TONNE_RENEWAL,
    MPWT0011535:
      InspectionValidityRule.NEW_COMMERCIAL_PASSENGER_OR_LIGHT_GOODS_VEHICLE,
    MPWT0011536: InspectionValidityRule.NEW_COMMERCIAL_HEAVY_GOODS_OR_PASSENGER,
    MPWT0011537: InspectionValidityRule.GOODS_UP_TO_TWO_TONNES,
    MPWT0011538: InspectionValidityRule.GOODS_OVER_TWO_TO_FIVE_TONNES,
    MPWT0011539:
      InspectionValidityRule.TRACTOR_OR_GOODS_OVER_FIVE_TO_TEN_TONNES,
    MPWT0011540: InspectionValidityRule.TRACTOR_OR_GOODS_OVER_TEN_TONNES,
    MPWT0011541: InspectionValidityRule.TRAILER_OR_SEMI_TRAILER,
    'MPWT-TRICYCLE-MOTORCYCLE-TRAILER':
      InspectionValidityRule.MOTOR_TRICYCLE_OR_MOTORCYCLE_TOWING_TRAILER,
  };

export interface InspectionValidity {
  years: 1 | 2 | 4;
  rule: InspectionValidityRule;
}

export interface AppliedInspectionValidity extends InspectionValidity {
  validUntil: string;
}

export function determineInspectionValidity(
  inspectionCategoryCode: string,
): InspectionValidity {
  const category = CATEGORY_BY_CODE.get(inspectionCategoryCode);
  const rule = RULE_BY_CATEGORY_CODE[inspectionCategoryCode];
  if (category === undefined || !category.isActive || rule === undefined)
    throw unsupportedValidityRule();
  return { years: validityYears(category.validityMonths), rule };
}

function validityYears(months: MpwtInspectionValidityMonths): 1 | 2 | 4 {
  switch (months) {
    case 12:
      return 1;
    case 24:
      return 2;
    case 48:
      return 4;
  }
}

function unsupportedValidityRule(): DomainException {
  return new DomainException(
    ApiErrorCode.INSPECTION_VALIDITY_RULE_UNSUPPORTED,
    HttpStatus.CONFLICT,
    'The vehicle inspection category has no confirmed validity rule',
  );
}

export function applyInspectionValidity(
  inspectionCategoryCode: string,
  completedAt: Date,
): AppliedInspectionValidity {
  const validity = determineInspectionValidity(inspectionCategoryCode);
  return {
    ...validity,
    validUntil: addCalendarYears(cambodiaDate(completedAt), validity.years),
  };
}

function cambodiaDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PHNOM_PENH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
