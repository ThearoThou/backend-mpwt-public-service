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
import { Appointment } from '../../scheduling/entities/appointment.entity';
import { User } from '../../users/entities/user.entity';
import { Sticker } from '../../stickers/entities/sticker.entity';
import { InspectionResult } from '../enums/inspection-result.enum';
import { InspectionStatus } from '../enums/inspection-status.enum';

@Entity({ name: 'inspections' })
@Index('idx_inspections_application_created', ['applicationId', 'createdAt'])
@Index('idx_inspections_status', ['status'])
@Index('idx_inspections_result', ['result'])
export class Inspection {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'attempt_number', type: 'smallint' })
  attemptNumber!: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: InspectionStatus,
    enumName: 'inspection_status',
    default: InspectionStatus.PENDING,
  })
  status!: InspectionStatus;

  @Column({
    name: 'result',
    type: 'enum',
    enum: InspectionResult,
    enumName: 'inspection_result',
    nullable: true,
  })
  result!: InspectionResult | null;

  @Column({ name: 'recorded_by_user_id', type: 'uuid', nullable: true })
  recordedByUserId!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(
    () => RenewalApplication,
    (application) => application.inspections,
    {
      cascade: false,
      eager: false,
      nullable: false,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication;

  @OneToOne(() => Appointment, (appointment) => appointment.inspection, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: Appointment;

  @ManyToOne(() => User, (user) => user.recordedInspections, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'recorded_by_user_id' })
  recordedByUser!: User | null;

  @OneToOne(() => Sticker, (sticker) => sticker.inspection, {
    cascade: false,
    eager: false,
    nullable: true,
  })
  sticker!: Sticker | null;
}
