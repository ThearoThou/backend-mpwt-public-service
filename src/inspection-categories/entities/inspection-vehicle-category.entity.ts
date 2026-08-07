import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { VehicleClass } from '../../vehicles/enums/vehicle-class.enum';

@Entity({ name: 'inspection_vehicle_categories' })
export class InspectionVehicleCategory {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'code', type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ name: 'name_kh', type: 'varchar', length: 200 })
  nameKh!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200, nullable: true })
  nameEn!: string | null;

  @Column({
    name: 'vehicle_class',
    type: 'enum',
    enum: VehicleClass,
    enumName: 'vehicle_class',
  })
  vehicleClass!: VehicleClass;

  @Column({ name: 'validity_months', type: 'smallint' })
  validityMonths!: number;

  @Column({
    name: 'inspection_fee_khr',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  inspectionFeeKhr!: string;

  @Column({
    name: 'service_fee_khr',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  serviceFeeKhr!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
