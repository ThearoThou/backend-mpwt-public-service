import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Appointment } from './appointment.entity';
import { InspectionStation } from './inspection-station.entity';

@Entity({ name: 'inspection_station_daily_capacities' })
@Index(
  'uq_inspection_station_daily_capacities_station_date',
  ['stationId', 'capacityDate'],
  { unique: true },
)
export class InspectionStationDailyCapacity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'station_id', type: 'uuid' })
  stationId!: string;

  @Column({ name: 'capacity_date', type: 'date' })
  capacityDate!: string;

  @Column({ name: 'daily_capacity', type: 'integer' })
  dailyCapacity!: number;

  @Column({ name: 'reserved_count', type: 'integer', default: 0 })
  reservedCount!: number;

  @Column({ name: 'is_closed', type: 'boolean', default: false })
  isClosed!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => InspectionStation, (station) => station.dailyCapacities, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'station_id' })
  station!: InspectionStation;

  @OneToMany(() => Appointment, (appointment) => appointment.dailyCapacity, {
    cascade: false,
    eager: false,
  })
  appointments!: Appointment[];
}
