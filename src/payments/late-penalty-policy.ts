import type { InspectionPolicy } from '../config/inspection-policy';
import {
  addCalendarYears,
  calendarDayDifference,
} from '../common/dates/calendar-date';

export function maximumChargeableLateDays(
  inspectionExpiryDate: string,
  maxPenaltyYears: number,
): number {
  return calendarDayDifference(
    inspectionExpiryDate,
    addCalendarYears(inspectionExpiryDate, maxPenaltyYears),
  );
}

export function chargeableLateDays(
  actualLateDays: number,
  inspectionExpiryDate: string,
  policy: InspectionPolicy['latePenalty'],
): number {
  return Math.min(
    actualLateDays,
    maximumChargeableLateDays(inspectionExpiryDate, policy.maxPenaltyYears),
  );
}
