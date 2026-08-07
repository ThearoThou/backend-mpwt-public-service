import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { VehicleClass } from '../enums/vehicle-class.enum';

@Entity({ name: 'vehicle_classification_history' })
export class VehicleClassificationHistory {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Column({
    name: 'previous_vehicle_class',
    type: 'enum',
    enum: VehicleClass,
    enumName: 'vehicle_class',
    nullable: true,
  })
  previousVehicleClass!: VehicleClass | null;

  @Column({
    name: 'new_vehicle_class',
    type: 'enum',
    enum: VehicleClass,
    enumName: 'vehicle_class',
  })
  newVehicleClass!: VehicleClass;

  @Column({
    name: 'previous_inspection_category_id',
    type: 'uuid',
    nullable: true,
  })
  previousInspectionCategoryId!: string | null;

  @Column({ name: 'new_inspection_category_id', type: 'uuid' })
  newInspectionCategoryId!: string;

  @Column({ name: 'changed_by_admin_id', type: 'uuid' })
  changedByAdminId!: string;

  @Column({ name: 'reason', type: 'text' })
  reason!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
