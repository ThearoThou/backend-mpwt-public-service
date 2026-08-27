import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AppointmentSlot } from './appointment-slot.entity';
import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { InspectionStationDailyCapacity } from './inspection-station-daily-capacity.entity';
import { Inspection } from '../../inspections/entities/inspection.entity';

@Entity({ name: 'inspection_stations' })
export class InspectionStation {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'code', type: 'varchar', length: 30, unique: true })
  code!: string;

  @Column({ name: 'name_kh', type: 'varchar', length: 200 })
  nameKh!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200 })
  nameEn!: string;

  @Column({ name: 'province', type: 'varchar', length: 100 })
  province!: string;

  @Column({ name: 'address', type: 'text' })
  address!: string;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(
    () => AppointmentSlot,
    (appointmentSlot) => appointmentSlot.station,
    {
      cascade: false,
      eager: false,
    },
  )
  appointmentSlots!: AppointmentSlot[];

  @OneToMany(
    () => InspectionStationDailyCapacity,
    (capacity) => capacity.station,
    {
      cascade: false,
      eager: false,
    },
  )
  dailyCapacities!: InspectionStationDailyCapacity[];

  @OneToMany(
    () => RenewalApplication,
    (application) => application.preferredInspectionStation,
    {
      cascade: false,
      eager: false,
    },
  )
  preferredRenewalApplications!: RenewalApplication[];

  @OneToMany(() => Inspection, (inspection) => inspection.actualStation, {
    cascade: false,
    eager: false,
  })
  inspections!: Inspection[];
}
