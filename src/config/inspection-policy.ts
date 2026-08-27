/**
 * Changeable Vehicle Inspection business-policy defaults. Keep similarly sized
 * values separate: they represent independent rules and may diverge later.
 */
export interface InspectionPolicy {
  renewalEligibility: { advanceWindowDays: number };
  latePenalty: {
    startsAfterDays: number;
    lightRateKhrPerDay: number;
    heavyRateKhrPerDay: number;
    maxPenaltyYears: number;
  };
  application: { initialInspectionPeriodDays: number };
  scheduling: { sameDayCutoffHour: number };
}

export const inspectionPolicy: Readonly<InspectionPolicy> = {
  renewalEligibility: {
    advanceWindowDays: 30,
  },
  latePenalty: {
    startsAfterDays: 30,
    lightRateKhrPerDay: 500,
    heavyRateKhrPerDay: 2000,
    maxPenaltyYears: 2,
  },
  application: {
    initialInspectionPeriodDays: 30,
  },
  scheduling: {
    sameDayCutoffHour: 17,
  },
};
