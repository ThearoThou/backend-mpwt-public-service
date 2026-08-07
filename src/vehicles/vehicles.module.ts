import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonAuthModule } from '../common/auth/common-auth.module';
import { InspectionCategoriesModule } from '../inspection-categories/inspection-categories.module';
import { User } from '../users/entities/user.entity';
import { Vehicle } from './entities/vehicle.entity';
import { VehicleClassificationHistory } from './entities/vehicle-classification-history.entity';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleClassificationService } from './vehicle-classification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, User, VehicleClassificationHistory]),
    CommonAuthModule,
    InspectionCategoriesModule,
  ],
  controllers: [VehiclesController, AdminVehiclesController],
  providers: [VehiclesService, VehicleClassificationService],
})
export class VehiclesModule {}
