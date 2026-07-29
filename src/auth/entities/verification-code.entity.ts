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
import { VerificationPurpose } from '../enums/verification-purpose.enum';

@Entity({ name: 'verification_codes' })
@Index(['destination', 'purpose', 'createdAt'])
export class VerificationCode {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'destination', type: 'varchar', length: 255 })
  destination!: string;

  @Column({
    name: 'purpose',
    type: 'enum',
    enum: VerificationPurpose,
    enumName: 'verification_purpose',
  })
  purpose!: VerificationPurpose;

  @Column({
    name: 'code_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  codeHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.verificationCodes, {
    cascade: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
}
