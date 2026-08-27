import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Official Cambodian public-holiday closure, independent of stations/capacity. */
@Entity({ name: 'inspection_service_closures' })
export class InspectionServiceClosure {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'closure_date', type: 'date', unique: true })
  closureDate!: string;

  @Column({ name: 'reason_kh', type: 'varchar', length: 500 })
  reasonKh!: string;

  @Column({ name: 'reason_en', type: 'varchar', length: 500 })
  reasonEn!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
