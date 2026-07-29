import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApplicationTimelineEvent } from './entities/application-timeline-event.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AdminAuditController } from './admin-audit.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApplicationTimelineEvent, AuditLog])],
  controllers: [AdminAuditController],
  providers: [ActivityService],
})
export class ActivityModule {}
