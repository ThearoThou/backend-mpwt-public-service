import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminReportsController } from './admin-reports.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminDashboardController, AdminReportsController],
  providers: [AdminService],
})
export class AdminModule {}
