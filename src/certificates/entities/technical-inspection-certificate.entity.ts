import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { Inspection } from '../../inspections/entities/inspection.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'technical_inspection_certificates' })
@Check(
  'chk_technical_inspection_certificates_number_trimmed_nonempty',
  `"certificate_number" = btrim("certificate_number") AND "certificate_number" <> ''`,
)
export class TechnicalInspectionCertificate {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid', unique: true })
  applicationId!: string;

  @Column({ name: 'inspection_id', type: 'uuid', unique: true })
  inspectionId!: string;

  @Column({
    name: 'certificate_number',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  certificateNumber!: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'issued_by_user_id', type: 'uuid', nullable: true })
  issuedByUserId!: string | null;

  @Column({
    name: 'artifact_file_key',
    type: 'varchar',
    length: 500,
    unique: true,
  })
  artifactFileKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToOne(
    () => RenewalApplication,
    (application) => application.technicalInspectionCertificate,
    { cascade: false, eager: false, nullable: false, onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication;

  @OneToOne(
    () => Inspection,
    (inspection) => inspection.technicalInspectionCertificate,
    { cascade: false, eager: false, nullable: false, onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'inspection_id' })
  inspection!: Inspection;

  @ManyToOne(() => User, (user) => user.issuedTechnicalInspectionCertificates, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'issued_by_user_id' })
  issuedByUser!: User | null;
}
