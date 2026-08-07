import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { RenewalApplication } from './renewal-application.entity';

@Entity({ name: 'renewal_application_status_history' })
export class RenewalApplicationStatusHistory {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({
    name: 'previous_status',
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'application_status',
    nullable: true,
  })
  previousStatus!: ApplicationStatus | null;

  @Column({
    name: 'new_status',
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'application_status',
  })
  newStatus!: ApplicationStatus;

  @Column({ name: 'changed_by_user_id', type: 'uuid', nullable: true })
  changedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(
    () => RenewalApplication,
    (application) => application.statusHistory,
    {
      cascade: false,
      eager: false,
      nullable: false,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication;

  @ManyToOne(
    () => User,
    (user) => user.changedRenewalApplicationStatusHistory,
    {
      cascade: false,
      eager: false,
      nullable: true,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'changed_by_user_id' })
  changedByUser!: User | null;
}
