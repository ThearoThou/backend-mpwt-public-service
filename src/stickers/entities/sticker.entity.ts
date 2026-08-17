import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { Inspection } from '../../inspections/entities/inspection.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'stickers' })
export class Sticker {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ name: 'inspection_id', type: 'uuid' })
  inspectionId!: string;

  @Column({
    name: 'sticker_number',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  stickerNumber!: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'issued_by_user_id', type: 'uuid', nullable: true })
  issuedByUserId!: string | null;

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

  @OneToOne(() => Inspection, (inspection) => inspection.sticker, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'inspection_id' })
  inspection!: Inspection;

  @ManyToOne(() => User, (user) => user.issuedStickers, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'issued_by_user_id' })
  issuedByUser!: User | null;
}
