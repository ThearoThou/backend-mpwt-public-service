import { Module } from '@nestjs/common';
import { ActivityModule } from './activity/activity.module';
import { AdminModule } from './admin/admin.module';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { InspectionsModule } from './inspections/inspections.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { StickersModule } from './stickers/stickers.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    ApplicationsModule,
    SchedulingModule,
    PaymentsModule,
    InspectionsModule,
    StickersModule,
    NotificationsModule,
    ActivityModule,
    FilesModule,
    AdminModule,
    CommonModule,
  ],
})
export class AppModule {}
