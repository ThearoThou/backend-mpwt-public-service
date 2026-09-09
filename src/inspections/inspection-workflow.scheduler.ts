import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InspectionExpiryService } from './inspection-expiry.service';

@Injectable()
export class InspectionWorkflowScheduler {
  private readonly logger = new Logger(InspectionWorkflowScheduler.name);
  private busy = false;

  constructor(private readonly expiry: InspectionExpiryService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processInspectionWorkflows(): Promise<void> {
    if (this.busy) {
      this.logger.warn('Inspection workflow processing already in progress');
      return;
    }
    this.busy = true;
    try {
      const result = await this.expiry.processDueActions();
      this.logger.log(
        `Inspection workflow processing completed: ${JSON.stringify(result)}`,
      );
    } catch (error) {
      this.logger.error(
        'Inspection workflow processing failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.busy = false;
    }
  }
}
