import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { PaymentStatus } from '../enums/payment-status.enum';
import { Payment } from './payment.entity';

@Entity({ name: 'payment_status_history' })
@Index('idx_payment_status_history_payment_created', ['paymentId', 'createdAt'])
@Index('idx_payment_status_history_changed_by_user', ['changedByUserId'])
export class PaymentStatusHistory {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
  })
  fromStatus!: PaymentStatus;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
  })
  toStatus!: PaymentStatus;

  @Column({ name: 'changed_by_user_id', type: 'uuid', nullable: true })
  changedByUserId!: string | null;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Payment, (payment) => payment.statusHistory, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment;

  @ManyToOne(() => User, (user) => user.changedPaymentStatusHistory, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'changed_by_user_id' })
  changedByUser!: User | null;
}
