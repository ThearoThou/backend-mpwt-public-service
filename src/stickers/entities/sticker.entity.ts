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
import { StickerStatus } from '../enums/sticker-status.enum';

@Entity({ name: 'stickers' })
@Index('idx_stickers_status', ['status'])
export class Sticker {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: StickerStatus,
    enumName: 'sticker_status',
    default: StickerStatus.NOT_READY,
  })
  status!: StickerStatus;

  @Column({
    name: 'sticker_number',
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
  })
  stickerNumber!: string | null;

  @Column({
    name: 'certificate_number',
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
  })
  certificateNumber!: string | null;

  @Column({
    name: 'certificate_file_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  certificateFileKey!: string | null;

  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true })
  readyAt!: Date | null;

  @Column({ name: 'marked_ready_by_user_id', type: 'uuid', nullable: true })
  markedReadyByUserId!: string | null;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt!: Date | null;

  @Column({ name: 'issued_by_user_id', type: 'uuid', nullable: true })
  issuedByUserId!: string | null;

  @Column({
    name: 'pickup_recipient_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  pickupRecipientName!: string | null;

  @Column({ name: 'pickup_notes', type: 'text', nullable: true })
  pickupNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => RenewalApplication, (application) => application.sticker, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication;

  @ManyToOne(() => User, (user) => user.markedReadyStickers, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'marked_ready_by_user_id' })
  markedReadyByUser!: User | null;

  @ManyToOne(() => User, (user) => user.issuedStickers, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'issued_by_user_id' })
  issuedByUser!: User | null;
}
