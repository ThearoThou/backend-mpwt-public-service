import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Vehicle } from './entities/vehicle.entity';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle])],
  controllers: [VehiclesController, AdminVehiclesController],
  providers: [VehiclesService],
})
export class VehiclesModule {}
