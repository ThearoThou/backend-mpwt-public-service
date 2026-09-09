import type { EntityManager } from 'typeorm';

import { inspectionPolicy } from '../config/inspection-policy';
import { RenewalApplication } from './entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { ApplicationStatus } from './enums/application-status.enum';

export const CAMBODIA_TIME_ZONE = 'Asia/Phnom_Penh';
export const INITIAL_APPLICATION_EXPIRY_REASON =
  'INITIAL_INSPECTION_PERIOD_EXPIRED';

export const INITIAL_APPLICATION_EXPIRY_STATUSES: readonly ApplicationStatus[] =
  [
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.CORRECTION_REQUIRED,
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
  ];

/**
 * Initial applications are valid for 30 Cambodia calendar days. The Cambodia
 * submission date is Day 1, so the start of Day 31 is the expiry boundary.
 */
export function getInitialApplicationExpiryDate(submittedAt: Date): string {
  return addCalendarDays(
    cambodiaCalendarDate(submittedAt),
    inspectionPolicy.application.initialInspectionPeriodDays,
  );
}

export function getInitialApplicationLastValidDate(submittedAt: Date): string {
  return addCalendarDays(
    cambodiaCalendarDate(submittedAt),
    inspectionPolicy.application.initialInspectionPeriodDays - 1,
  );
}

export function isInitialApplicationPeriodExpired(
  submittedAt: Date,
  now: Date,
): boolean {
  return (
    cambodiaCalendarDate(now) >= getInitialApplicationExpiryDate(submittedAt)
  );
}

export async function expireInitialApplicationIfDue(
  manager: EntityManager,
  application: RenewalApplication,
  now: Date,
): Promise<boolean> {
  if (
    application.submittedAt === null ||
    !INITIAL_APPLICATION_EXPIRY_STATUSES.includes(application.status) ||
    !isInitialApplicationPeriodExpired(application.submittedAt, now)
  ) {
    return false;
  }

  const previousStatus = application.status;
  application.status = ApplicationStatus.EXPIRED;
  await manager.getRepository(RenewalApplication).save(application);
  const history = manager.getRepository(RenewalApplicationStatusHistory);
  await history.save(
    history.create({
      applicationId: application.id,
      previousStatus,
      newStatus: ApplicationStatus.EXPIRED,
      changedByUserId: null,
      reason: INITIAL_APPLICATION_EXPIRY_REASON,
    }),
  );
  return true;
}

export function cambodiaCalendarDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMBODIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const result = parts.find((candidate) => candidate.type === type)?.value;
    if (result === undefined) throw new Error(`Missing Cambodia ${type}.`);
    return result;
  };
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
