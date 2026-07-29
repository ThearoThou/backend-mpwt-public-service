import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Inspection } from './entities/inspection.entity';
import { AdminInspectionsController } from './admin-inspections.controller';
import { InspectionsService } from './inspections.service';

@Module({
  imports: [TypeOrmModule.forFeature([Inspection])],
  controllers: [AdminInspectionsController],
  providers: [InspectionsService],
})
export class InspectionsModule {}
