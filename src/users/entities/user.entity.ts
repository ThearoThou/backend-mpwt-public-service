import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ApplicationDocument } from '../../applications/entities/application-document.entity';
import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { ApplicationTimelineEvent } from '../../activity/entities/application-timeline-event.entity';
import { AuditLog } from '../../activity/entities/audit-log.entity';
import { VerificationCode } from '../../auth/entities/verification-code.entity';
import { Inspection } from '../../inspections/entities/inspection.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { Appointment } from '../../scheduling/entities/appointment.entity';
import { Sticker } from '../../stickers/entities/sticker.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { CitizenProfile } from './citizen-profile.entity';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({
    name: 'role',
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.CITIZEN,
  })
  role!: UserRole;

  @Column({
    name: 'status',
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status',
    default: UserStatus.PENDING_VERIFICATION,
  })
  status!: UserStatus;

  @Column({
    name: 'phone',
    type: 'varchar',
    length: 20,
    nullable: true,
    unique: true,
  })
  phone!: string | null;

  @Column({
    name: 'email',
    type: 'varchar',
    length: 255,
    nullable: true,
    unique: true,
  })
  email!: string | null;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash!: string;

  @Column({ name: 'phone_verified_at', type: 'timestamptz', nullable: true })
  phoneVerifiedAt!: Date | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => CitizenProfile, (citizenProfile) => citizenProfile.user, {
    cascade: false,
  })
  citizenProfile!: CitizenProfile | null;

  @OneToMany(
    () => VerificationCode,
    (verificationCode) => verificationCode.user,
    { cascade: false },
  )
  verificationCodes!: VerificationCode[];

  @OneToMany(() => Vehicle, (vehicle) => vehicle.linkedCitizen, {
    cascade: false,
  })
  vehicles!: Vehicle[];

  @OneToMany(
    () => RenewalApplication,
    (renewalApplication) => renewalApplication.citizen,
    { cascade: false },
  )
  renewalApplications!: RenewalApplication[];

  @OneToMany(
    () => RenewalApplication,
    (renewalApplication) => renewalApplication.cancelledByUser,
    { cascade: false },
  )
  cancelledRenewalApplications!: RenewalApplication[];

  @OneToMany(
    () => ApplicationDocument,
    (applicationDocument) => applicationDocument.uploadedByUser,
    { cascade: false },
  )
  uploadedApplicationDocuments!: ApplicationDocument[];

  @OneToMany(
    () => ApplicationDocument,
    (applicationDocument) => applicationDocument.reviewedByUser,
    { cascade: false },
  )
  reviewedApplicationDocuments!: ApplicationDocument[];

  @OneToMany(() => Appointment, (appointment) => appointment.cancelledByUser, {
    cascade: false,
    eager: false,
  })
  cancelledAppointments!: Appointment[];

  @OneToMany(
    () => Appointment,
    (appointment) => appointment.noShowMarkedByUser,
    { cascade: false, eager: false },
  )
  noShowMarkedAppointments!: Appointment[];

  @OneToMany(() => Payment, (payment) => payment.confirmedByUser, {
    cascade: false,
    eager: false,
  })
  confirmedPayments!: Payment[];

  @OneToMany(() => Payment, (payment) => payment.rejectedByUser, {
    cascade: false,
    eager: false,
  })
  rejectedPayments!: Payment[];

  @OneToMany(() => Inspection, (inspection) => inspection.recordedByUser, {
    cascade: false,
    eager: false,
  })
  recordedInspections!: Inspection[];

  @OneToMany(() => Sticker, (sticker) => sticker.markedReadyByUser, {
    cascade: false,
    eager: false,
  })
  markedReadyStickers!: Sticker[];

  @OneToMany(() => Sticker, (sticker) => sticker.issuedByUser, {
    cascade: false,
    eager: false,
  })
  issuedStickers!: Sticker[];

  @OneToMany(() => Notification, (notification) => notification.recipientUser, {
    cascade: false,
    eager: false,
  })
  receivedNotifications!: Notification[];

  @OneToMany(() => Notification, (notification) => notification.createdByUser, {
    cascade: false,
    eager: false,
  })
  createdNotifications!: Notification[];

  @OneToMany(
    () => ApplicationTimelineEvent,
    (timelineEvent) => timelineEvent.actorUser,
    { cascade: false, eager: false },
  )
  actedTimelineEvents!: ApplicationTimelineEvent[];

  @OneToMany(() => AuditLog, (auditLog) => auditLog.actorUser, {
    cascade: false,
    eager: false,
  })
  auditLogs!: AuditLog[];
}
