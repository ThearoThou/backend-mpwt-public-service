import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { DocumentStatus } from '../enums/document-status.enum';
import { DocumentType } from '../enums/document-type.enum';
import { RenewalApplication } from './renewal-application.entity';

@Entity({ name: 'application_documents' })
@Index(
  'uq_application_documents_application_document_type_version',
  ['applicationId', 'documentType', 'versionNumber'],
  { unique: true },
)
@Index('idx_application_documents_application_status', [
  'applicationId',
  'status',
])
export class ApplicationDocument {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({
    name: 'document_type',
    type: 'enum',
    enum: DocumentType,
    enumName: 'document_type',
  })
  documentType!: DocumentType;

  @Column({ name: 'version_number', type: 'integer', default: 1 })
  versionNumber!: number;

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ name: 'replaces_document_id', type: 'uuid', nullable: true })
  replacesDocumentId!: string | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId!: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
  storageKey!: string;

  @Column({ name: 'original_file_name', type: 'varchar', length: 255 })
  originalFileName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'file_size_bytes', type: 'bigint' })
  fileSizeBytes!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DocumentStatus,
    enumName: 'document_status',
    default: DocumentStatus.PENDING,
  })
  status!: DocumentStatus;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({
    name: 'uploaded_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  uploadedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => RenewalApplication, (application) => application.documents, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application!: RenewalApplication;

  @ManyToOne(() => User, (user) => user.uploadedApplicationDocuments, {
    cascade: false,
    eager: false,
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedByUser!: User;

  @ManyToOne(() => User, (user) => user.reviewedApplicationDocuments, {
    cascade: false,
    eager: false,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'reviewed_by_user_id' })
  reviewedByUser!: User | null;

  @ManyToOne(
    () => ApplicationDocument,
    (document) => document.replacementDocuments,
    {
      cascade: false,
      eager: false,
      nullable: true,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({ name: 'replaces_document_id' })
  replacesDocument!: ApplicationDocument | null;

  @OneToMany(
    () => ApplicationDocument,
    (document) => document.replacesDocument,
    { cascade: false, eager: false },
  )
  replacementDocuments!: ApplicationDocument[];
}
