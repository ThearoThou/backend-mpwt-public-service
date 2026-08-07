import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { ApplicationStatus } from './enums/application-status.enum';

export interface RenewalApplicationStatusHistoryResponse {
  id: string;
  applicationId: string;
  previousStatus: ApplicationStatus | null;
  newStatus: ApplicationStatus;
  changedByUserId: string | null;
  createdAt: Date;
}

export function mapRenewalApplicationStatusHistory(
  history: RenewalApplicationStatusHistory,
): RenewalApplicationStatusHistoryResponse {
  return {
    id: history.id,
    applicationId: history.applicationId,
    previousStatus: history.previousStatus,
    newStatus: history.newStatus,
    changedByUserId: history.changedByUserId,
    createdAt: history.createdAt,
  };
}
