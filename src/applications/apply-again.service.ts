import { Injectable } from '@nestjs/common';

import { type RenewalApplicationResponse } from './application-response.mapper';
import {
  RenewAgainService,
  type ReplacementApplicationSourcePolicy,
} from './renew-again.service';
import { ApplicationStatus } from './enums/application-status.enum';

const FAILED_INSPECTION_SOURCE_POLICY: ReplacementApplicationSourcePolicy = {
  status: ApplicationStatus.INSPECTION_FAILED,
  invalidSourceMessage:
    'Only an inspection-failed application can be applied for again',
};

@Injectable()
export class ApplyAgainService {
  constructor(private readonly replacementApplications: RenewAgainService) {}

  async applyAgain(
    citizenId: string,
    failedApplicationId: string,
  ): Promise<RenewalApplicationResponse> {
    return this.replacementApplications.createReplacementDraft(
      citizenId,
      failedApplicationId,
      FAILED_INSPECTION_SOURCE_POLICY,
    );
  }
}
