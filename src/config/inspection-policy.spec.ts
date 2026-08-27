import { inspectionPolicy } from './inspection-policy';

describe('inspection policy defaults', () => {
  it('keeps independent current policy values centralized', () => {
    expect(inspectionPolicy).toEqual({
      renewalEligibility: { advanceWindowDays: 30 },
      latePenalty: {
        startsAfterDays: 30,
        lightRateKhrPerDay: 500,
        heavyRateKhrPerDay: 2000,
        maxPenaltyYears: 2,
      },
      application: { initialInspectionPeriodDays: 30 },
      scheduling: { sameDayCutoffHour: 17 },
    });
  });
});
