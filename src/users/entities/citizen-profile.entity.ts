import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

@Entity({ name: 'citizen_profiles' })
export class CitizenProfile {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'name_kh', type: 'varchar', length: 150 })
  nameKh!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 150 })
  nameEn!: string;

  @Column({
    name: 'national_id_number',
    type: 'varchar',
    length: 50,
    nullable: true,
    unique: true,
  })
  nationalIdNumber!: string | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address!: string | null;

  @Column({
    name: 'profile_image_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  profileImageKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => User, (user) => user.citizenProfile, {
    cascade: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
