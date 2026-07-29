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

import { AppointmentSlotStatus } from '../enums/appointment-slot-status.enum';
import { Appointment } from './appointment.entity';
import { InspectionStation } from './inspection-station.entity';

@Entity({ name: 'appointment_slots' })
@Index(
  'uq_appointment_slots_station_date_start_end',
  ['stationId', 'slotDate', 'startTime', 'endTime'],
  { unique: true },
)
@Index('idx_appointment_slots_station_date_status', [
  'stationId',
  'slotDate',
  'status',
])
export class AppointmentSlot {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'station_id', type: 'uuid' })
  stationId!: string;

  @Column({ name: 'slot_date', type: 'date' })
  slotDate!: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'capacity', type: 'smallint', default: 1 })
  capacity!: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AppointmentSlotStatus,
    enumName: 'appointment_slot_status',
    default: AppointmentSlotStatus.OPEN,
  })
  status!: AppointmentSlotStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => InspectionStation, (station) => station.appointmentSlots, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'station_id' })
  station!: InspectionStation;

  @OneToMany(() => Appointment, (appointment) => appointment.slot, {
    cascade: false,
    eager: false,
  })
  appointments!: Appointment[];
}
