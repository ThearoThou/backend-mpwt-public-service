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
  application: {
    initialInspectionPeriodDays: number;
    noShowRebookingDeadlineDays: number;
    reinspectionDeadlineDays: number;
  };
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
    // These independent workflow deadlines currently have the same value as
    // the initial inspection period. Keep them named separately so future
    // policy changes cannot accidentally alter all three rules.
    noShowRebookingDeadlineDays: 30,
    reinspectionDeadlineDays: 30,
  },
  scheduling: {
    sameDayCutoffHour: 17,
  },
};
