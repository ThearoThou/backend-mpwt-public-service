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
import { User } from '../../users/entities/user.entity';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

@Entity({ name: 'payments' })
@Index('idx_payments_status', ['status'])
@Index('idx_payments_method', ['method'])
export class Payment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({
    name: 'invoice_number',
    type: 'varchar',
    length: 50,
    unique: true,
  })
  invoiceNumber!: string;

  @Column({
    name: 'receipt_number',
    type: 'varchar',
    length: 50,
    nullable: true,
    unique: true,
  })
  receiptNumber!: string | null;

  @Column({
    name: 'method',
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method',
  })
  method!: PaymentMethod;

  @Column({
    name: 'status',
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  @Column({
    name: 'base_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  baseAmount!: string;

  @Column({
    name: 'late_fee',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  lateFee!: string;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  totalAmount!: string;

  @Column({ name: 'currency', type: 'char', length: 3, default: 'KHR' })
  currency!: string;

  @Column({
    name: 'payment_reference',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  paymentReference!: string | null;

  @Column({
    name: 'provider_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerName!: string | null;

  @Column({
    name: 'provider_transaction_id',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  providerTransactionId!: string | null;

  @Column({ name: 'confirmed_by_user_id', type: 'uuid', nullable: true })
  confirmedByUserId!: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt!: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'rejected_by_user_id', type: 'uuid', nullable: true })
  rejectedByUserId!: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({
    name: 'invoice_issued_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  invoiceIssuedAt!: Date;

  @Column({
    name: 'invoice_file_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  invoiceFileKey!: string | null;

  @Column({
    name: 'receipt_file_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  receiptFileKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => RenewalApplication, (application) => application.payment, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication;

  @ManyToOne(() => User, (user) => user.confirmedPayments, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'confirmed_by_user_id' })
  confirmedByUser!: User | null;

  @ManyToOne(() => User, (user) => user.rejectedPayments, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'rejected_by_user_id' })
  rejectedByUser!: User | null;
}
