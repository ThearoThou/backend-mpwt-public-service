import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { Inspection } from '../../inspections/entities/inspection.entity';
import { User } from '../../users/entities/user.entity';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { AppointmentSlot } from './appointment-slot.entity';

@Entity({ name: 'appointments' })
@Index('uq_appointments_id_application', ['id', 'applicationId'], {
  unique: true,
})
@Index('idx_appointments_application_status', ['applicationId', 'status'])
@Index('idx_appointments_slot_status', ['slotId', 'status'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ name: 'slot_id', type: 'uuid' })
  slotId!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AppointmentStatus,
    enumName: 'appointment_status',
    default: AppointmentStatus.SCHEDULED,
  })
  status!: AppointmentStatus;

  @Column({
    name: 'booked_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  bookedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by_user_id', type: 'uuid', nullable: true })
  cancelledByUserId!: string | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ name: 'no_show_marked_at', type: 'timestamptz', nullable: true })
  noShowMarkedAt!: Date | null;

  @Column({ name: 'no_show_marked_by_user_id', type: 'uuid', nullable: true })
  noShowMarkedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(
    () => RenewalApplication,
    (application) => application.appointments,
    {
      cascade: false,
      eager: false,
      nullable: false,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication;

  @ManyToOne(() => AppointmentSlot, (slot) => slot.appointments, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'slot_id' })
  slot!: AppointmentSlot;

  @ManyToOne(() => User, (user) => user.cancelledAppointments, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'cancelled_by_user_id' })
  cancelledByUser!: User | null;

  @ManyToOne(() => User, (user) => user.noShowMarkedAppointments, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'no_show_marked_by_user_id' })
  noShowMarkedByUser!: User | null;

  @OneToOne(() => Inspection, (inspection) => inspection.appointment, {
    cascade: false,
    eager: false,
    nullable: true,
  })
  inspection!: Inspection | null;
}
