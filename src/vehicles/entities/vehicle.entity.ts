import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { User } from '../../users/entities/user.entity';
import { VehiclePlateCategory } from '../enums/vehicle-plate-category.enum';
import { VehicleClass } from '../enums/vehicle-class.enum';

@Entity({ name: 'vehicles' })
export class Vehicle {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'linked_citizen_id', type: 'uuid', nullable: true })
  linkedCitizenId!: string | null;

  @Column({
    name: 'registration_number',
    type: 'varchar',
    length: 50,
    unique: true,
  })
  registrationNumber!: string;

  @Column({ name: 'plate_number', type: 'varchar', length: 30 })
  plateNumber!: string;

  @Column({
    name: 'plate_category',
    type: 'enum',
    enum: VehiclePlateCategory,
    enumName: 'vehicle_plate_category',
  })
  plateCategory!: VehiclePlateCategory;

  @Column({
    name: 'plate_province',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  plateProvince!: string | null;

  @Column({ name: 'plate_type', type: 'varchar', length: 50 })
  plateType!: string;

  @Column({ name: 'vehicle_type', type: 'varchar', length: 50 })
  vehicleType!: string;

  @Column({
    name: 'vehicle_class',
    type: 'enum',
    enum: VehicleClass,
    enumName: 'vehicle_class',
    nullable: true,
  })
  vehicleClass!: VehicleClass | null;

  @Column({ name: 'inspection_category_id', type: 'uuid', nullable: true })
  inspectionCategoryId!: string | null;

  @Column({
    name: 'classification_verified_at',
    type: 'timestamptz',
    nullable: true,
  })
  classificationVerifiedAt!: Date | null;

  @Column({
    name: 'classification_verified_by',
    type: 'uuid',
    nullable: true,
  })
  classificationVerifiedBy!: string | null;

  @Column({ name: 'make', type: 'varchar', length: 100 })
  make!: string;

  @Column({ name: 'model', type: 'varchar', length: 100 })
  model!: string;

  @Column({ name: 'manufacture_year', type: 'smallint', nullable: true })
  manufactureYear!: number | null;

  @Column({
    name: 'chassis_number',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  chassisNumber!: string;

  @Column({ name: 'first_registration_date', type: 'date' })
  firstRegistrationDate!: string;

  @Column({ name: 'last_inspection_date', type: 'date', nullable: true })
  lastInspectionDate!: string | null;

  @Column({ name: 'inspection_expiry_date', type: 'date' })
  inspectionExpiryDate!: string;

  @Column({ name: 'registered_owner_name_kh', type: 'varchar', length: 150 })
  registeredOwnerNameKh!: string;

  @Column({ name: 'registered_owner_name_en', type: 'varchar', length: 150 })
  registeredOwnerNameEn!: string;

  @Column({ name: 'registered_owner_phone', type: 'varchar', length: 20 })
  registeredOwnerPhone!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.vehicles, {
    cascade: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'linked_citizen_id' })
  linkedCitizen!: User | null;

  @OneToMany(
    () => RenewalApplication,
    (renewalApplication) => renewalApplication.vehicle,
    { cascade: false },
  )
  renewalApplications!: RenewalApplication[];
}
