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
import { TimelineEventType } from '../enums/timeline-event-type.enum';

@Entity({ name: 'application_timeline_events' })
@Index('idx_timeline_application_occurred', ['applicationId', 'occurredAt'])
@Index('idx_timeline_application_visible_occurred', [
  'applicationId',
  'visibleToCitizen',
  'occurredAt',
])
export class ApplicationTimelineEvent {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: TimelineEventType,
    enumName: 'timeline_event_type',
  })
  eventType!: TimelineEventType;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'message', type: 'text', nullable: true })
  message!: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'visible_to_citizen', type: 'boolean', default: true })
  visibleToCitizen!: boolean;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  occurredAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(
    () => RenewalApplication,
    (application) => application.timelineEvents,
    {
      cascade: false,
      eager: false,
      nullable: false,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication;

  @ManyToOne(() => User, (user) => user.actedTimelineEvents, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser!: User | null;
}
