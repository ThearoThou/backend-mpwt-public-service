import { inspectionPolicy } from './inspection-policy';

describe('inspection policy', () => {
  it('keeps the independent 30-day workflow periods centralized', () => {
    expect(inspectionPolicy.application).toEqual({
      initialInspectionPeriodDays: 30,
      noShowRebookingDeadlineDays: 30,
      reinspectionDeadlineDays: 30,
    });
  });

  it('preserves the late-penalty and same-day scheduling policy', () => {
    expect(inspectionPolicy.latePenalty).toEqual({
      startsAfterDays: 30,
      lightRateKhrPerDay: 500,
      heavyRateKhrPerDay: 2000,
      maxPenaltyYears: 2,
    });
    expect(inspectionPolicy.scheduling.sameDayCutoffHour).toBe(17);
  });
});
