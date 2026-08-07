import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonAuthModule } from '../common/auth/common-auth.module';
import { User } from '../users/entities/user.entity';
import { AdminInspectionCategoriesController } from './admin-inspection-categories.controller';
import { InspectionVehicleCategory } from './entities/inspection-vehicle-category.entity';
import { InspectionCategoriesService } from './inspection-categories.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InspectionVehicleCategory, User]),
    CommonAuthModule,
  ],
  controllers: [AdminInspectionCategoriesController],
  providers: [InspectionCategoriesService],
  exports: [InspectionCategoriesService],
})
export class InspectionCategoriesModule {}
