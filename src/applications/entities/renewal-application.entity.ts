import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { ApplicationTimelineEvent } from '../../activity/entities/application-timeline-event.entity';
import { AuditLog } from '../../activity/entities/audit-log.entity';
import { Inspection } from '../../inspections/entities/inspection.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Sticker } from '../../stickers/entities/sticker.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { ApplicationDocument } from './application-document.entity';
import { Appointment } from '../../scheduling/entities/appointment.entity';
import { InspectionStation } from '../../scheduling/entities/inspection-station.entity';
import { RenewalApplicationStatusHistory } from './renewal-application-status-history.entity';

@Entity({ name: 'renewal_applications' })
@Index('idx_renewal_applications_citizen_submitted_at', [
  'citizenId',
  'submittedAt',
])
@Index('idx_renewal_applications_vehicle_submitted_at', [
  'vehicleId',
  'submittedAt',
])
@Index('idx_renewal_applications_status', ['status'])
@Index('idx_renewal_applications_preferred_station_date', [
  'preferredInspectionStationId',
  'preferredInspectionDate',
])
export class RenewalApplication {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 50,
    unique: true,
    nullable: true,
  })
  referenceNumber!: string | null;

  @Column({ name: 'citizen_id', type: 'uuid' })
  citizenId!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'application_status',
    default: ApplicationStatus.DRAFT,
  })
  status!: ApplicationStatus;

  @Column({ name: 'applicant_snapshot', type: 'jsonb', nullable: true })
  applicantSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'vehicle_snapshot', type: 'jsonb', nullable: true })
  vehicleSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'current_correction_reason', type: 'text', nullable: true })
  currentCorrectionReason!: string | null;

  @Column({ name: 'current_rejection_reason', type: 'text', nullable: true })
  currentRejectionReason!: string | null;

  @Column({
    name: 'preferred_inspection_station_id',
    type: 'uuid',
    nullable: true,
  })
  preferredInspectionStationId!: string | null;

  @Column({ name: 'preferred_inspection_date', type: 'date', nullable: true })
  preferredInspectionDate!: string | null;

  @Column({
    name: 'submitted_at',
    type: 'timestamptz',
    nullable: true,
  })
  submittedAt!: Date | null;

  @Column({ name: 'review_started_at', type: 'timestamptz', nullable: true })
  reviewStartedAt!: Date | null;

  @Column({
    name: 'ready_for_inspection_at',
    type: 'timestamptz',
    nullable: true,
  })
  readyForInspectionAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by_user_id', type: 'uuid', nullable: true })
  cancelledByUserId!: string | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.renewalApplications, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'citizen_id' })
  citizen!: User;

  @ManyToOne(() => Vehicle, (vehicle) => vehicle.renewalApplications, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  @ManyToOne(() => User, (user) => user.cancelledRenewalApplications, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'cancelled_by_user_id' })
  cancelledByUser!: User | null;

  @ManyToOne(
    () => InspectionStation,
    (station) => station.preferredRenewalApplications,
    {
      cascade: false,
      eager: false,
      nullable: true,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'preferred_inspection_station_id' })
  preferredInspectionStation!: InspectionStation | null;

  @OneToMany(() => ApplicationDocument, (document) => document.application, {
    cascade: false,
    eager: false,
  })
  documents!: ApplicationDocument[];

  @OneToMany(
    () => RenewalApplicationStatusHistory,
    (history) => history.application,
    { cascade: false, eager: false },
  )
  statusHistory!: RenewalApplicationStatusHistory[];

  @OneToMany(() => Appointment, (appointment) => appointment.application, {
    cascade: false,
    eager: false,
  })
  appointments!: Appointment[];

  @OneToOne(() => Payment, (payment) => payment.application, {
    cascade: false,
    eager: false,
    nullable: true,
  })
  payment!: Payment | null;

  @OneToMany(() => Inspection, (inspection) => inspection.application, {
    cascade: false,
    eager: false,
  })
  inspections!: Inspection[];

  @OneToOne(() => Sticker, (sticker) => sticker.application, {
    cascade: false,
    eager: false,
    nullable: true,
  })
  sticker!: Sticker | null;

  @OneToMany(() => Notification, (notification) => notification.application, {
    cascade: false,
    eager: false,
  })
  notifications!: Notification[];

  @OneToMany(
    () => ApplicationTimelineEvent,
    (timelineEvent) => timelineEvent.application,
    { cascade: false, eager: false },
  )
  timelineEvents!: ApplicationTimelineEvent[];

  @OneToMany(() => AuditLog, (auditLog) => auditLog.application, {
    cascade: false,
    eager: false,
  })
  auditLogs!: AuditLog[];
}
