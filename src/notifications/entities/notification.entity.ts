import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationChannel } from '../enums/notification-channel.enum';
import { NotificationDeliveryStatus } from '../enums/notification-delivery-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

@Entity({ name: 'notifications' })
@Index('idx_notifications_recipient_read_created', [
  'recipientUserId',
  'isRead',
  'createdAt',
])
@Index('idx_notifications_application_created', ['applicationId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'recipient_user_id', type: 'uuid' })
  recipientUserId!: string;

  @Column({ name: 'application_id', type: 'uuid', nullable: true })
  applicationId!: string | null;

  @Column({
    name: 'type',
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type',
  })
  type!: NotificationType;

  @Column({
    name: 'channel',
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel',
    default: NotificationChannel.IN_APP,
  })
  channel!: NotificationChannel;

  @Column({
    name: 'delivery_status',
    type: 'enum',
    enum: NotificationDeliveryStatus,
    enumName: 'notification_delivery_status',
    default: NotificationDeliveryStatus.SENT,
  })
  deliveryStatus!: NotificationDeliveryStatus;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'message', type: 'text' })
  message!: string;

  @Column({ name: 'data', type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt!: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.receivedNotifications, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'recipient_user_id' })
  recipientUser!: User;

  @ManyToOne(
    () => RenewalApplication,
    (application) => application.notifications,
    {
      cascade: false,
      eager: false,
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication | null;

  @ManyToOne(() => User, (user) => user.createdNotifications, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User | null;
}
