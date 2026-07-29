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
import { AuditActorType } from '../enums/audit-actor-type.enum';

@Entity({ name: 'audit_logs' })
@Index('idx_audit_logs_application_created', ['applicationId', 'createdAt'])
@Index('idx_audit_logs_entity_created', ['entityType', 'entityId', 'createdAt'])
@Index('idx_audit_logs_actor_created', ['actorUserId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: AuditActorType,
    enumName: 'audit_actor_type',
  })
  actorType!: AuditActorType;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'application_id', type: 'uuid', nullable: true })
  applicationId!: string | null;

  @Column({ name: 'action', type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'old_values', type: 'jsonb', nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column({ name: 'new_values', type: 'jsonb', nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.auditLogs, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser!: User | null;

  @ManyToOne(() => RenewalApplication, (application) => application.auditLogs, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication | null;
}
