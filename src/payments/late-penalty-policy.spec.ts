import { inspectionPolicy } from '../config/inspection-policy';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';
import {
  chargeableLateDays,
  maximumChargeableLateDays,
} from './late-penalty-policy';

function lateFee(
  actualLateDays: number,
  expiryDate: string,
  vehicleClass: VehicleClass,
  policy = inspectionPolicy.latePenalty,
): number {
  const rate =
    vehicleClass === VehicleClass.LIGHT
      ? policy.lightRateKhrPerDay
      : policy.heavyRateKhrPerDay;
  return chargeableLateDays(actualLateDays, expiryDate, policy) * rate;
}

describe('late-penalty policy', () => {
  it('charges only overdue days after the configured grace period', () => {
    expect(lateFee(0, '2026-01-01', VehicleClass.LIGHT)).toBe(0);
    expect(lateFee(10, '2026-01-01', VehicleClass.LIGHT)).toBe(0);
    expect(lateFee(30, '2026-01-01', VehicleClass.LIGHT)).toBe(0);
    expect(lateFee(31, '2026-01-01', VehicleClass.LIGHT)).toBe(500);
    expect(lateFee(31, '2026-01-01', VehicleClass.HEAVY)).toBe(2_000);
    expect(lateFee(36, '2026-01-01', VehicleClass.LIGHT)).toBe(3_000);
    expect(lateFee(36, '2026-01-01', VehicleClass.HEAVY)).toBe(12_000);
    expect(lateFee(60, '2026-01-01', VehicleClass.LIGHT)).toBe(15_000);
    expect(lateFee(60, '2026-01-01', VehicleClass.HEAVY)).toBe(60_000);
  });

  it('uses the full two-calendar-year period at and beyond the cap', () => {
    const expiry = '2023-03-01';
    expect(maximumChargeableLateDays(expiry, 2)).toBe(731);
    expect(chargeableLateDays(731, expiry, inspectionPolicy.latePenalty)).toBe(
      701,
    );
    expect(chargeableLateDays(900, expiry, inspectionPolicy.latePenalty)).toBe(
      701,
    );
    expect(lateFee(900, expiry, VehicleClass.LIGHT)).toBe(350_500);
  });

  it('uses 730 days when the two-year period has no leap day and clamps Feb 29', () => {
    expect(maximumChargeableLateDays('2024-03-01', 2)).toBe(730);
    expect(maximumChargeableLateDays('2024-02-29', 2)).toBe(730);
  });

  it('uses supplied policy values rather than fixed rates, threshold, or cap years', () => {
    const policy = {
      startsAfterDays: 2,
      lightRateKhrPerDay: 7,
      heavyRateKhrPerDay: 11,
      maxPenaltyYears: 1,
    } as const;
    expect(lateFee(2, '2024-01-01', VehicleClass.LIGHT, policy)).toBe(0);
    expect(lateFee(3, '2024-01-01', VehicleClass.LIGHT, policy)).toBe(7);
    expect(lateFee(500, '2024-01-01', VehicleClass.HEAVY, policy)).toBe(
      364 * 11,
    );
  });
});
