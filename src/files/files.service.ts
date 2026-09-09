import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';

export interface StoredPrivateFile {
  storageKey: string;
}

export const PAYMENT_ARTIFACT_KINDS = [
  'invoice',
  'receipt',
  'inspection-sheet',
] as const;
export type PaymentArtifactKind = (typeof PAYMENT_ARTIFACT_KINDS)[number];

@Injectable()
export class FilesService {
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root = resolve(
      process.cwd(),
      configService.getOrThrow<string>('PRIVATE_STORAGE_ROOT') ??
        'storage/private',
    );
  }

  async saveApplicationDocument(
    applicationId: string,
    content: Buffer,
    extension: string,
  ): Promise<StoredPrivateFile> {
    const storageKey = `application-documents/${applicationId}/${this.createOpaqueId()}.${extension}`;
    const path = this.resolveStorageKey(storageKey);
    await fs.mkdir(resolve(path, '..'), { recursive: true });
    await fs.writeFile(path, content, { flag: 'wx' });
    return { storageKey };
  }

  async savePaymentArtifact(
    applicationId: string,
    kind: PaymentArtifactKind,
    content: Buffer,
  ): Promise<StoredPrivateFile> {
    if (!isSafeStorageSegment(applicationId)) {
      throw new Error('Invalid payment artifact application ID');
    }
    if (!PAYMENT_ARTIFACT_KINDS.includes(kind)) {
      throw new Error('Invalid payment artifact kind');
    }
    if (!content.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('Payment artifacts must be PDF files');
    }
    const storageKey = `payment-artifacts/${applicationId}/${kind}/${this.createOpaqueId()}.pdf`;
    const path = this.resolveStorageKey(storageKey);
    await fs.mkdir(resolve(path, '..'), { recursive: true });
    await fs.writeFile(path, content, { flag: 'wx' });
    return { storageKey };
  }

  async saveCertificateArtifact(
    applicationId: string,
    content: Buffer,
  ): Promise<StoredPrivateFile> {
    if (!isSafeStorageSegment(applicationId)) {
      throw new Error('Invalid certificate artifact application ID');
    }
    if (!content.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('Certificate artifacts must be PDF files');
    }
    const storageKey = `certificate-artifacts/${applicationId}/${this.createOpaqueId()}.pdf`;
    const path = this.resolveStorageKey(storageKey);
    await fs.mkdir(resolve(path, '..'), { recursive: true });
    await fs.writeFile(path, content, { flag: 'wx' });
    return { storageKey };
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolveStorageKey(storageKey));
  }

  async deleteIfExists(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveStorageKey(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  protected createOpaqueId(): string {
    return crypto.randomUUID();
  }

  private resolveStorageKey(storageKey: string): string {
    if (
      storageKey === '' ||
      basename(storageKey) !== storageKey.split('/').at(-1)
    ) {
      throw new Error('Invalid private storage key');
    }
    const resolved = resolve(this.root, ...storageKey.split('/'));
    const pathRelative = relative(this.root, resolved);
    if (
      pathRelative === '' ||
      pathRelative.startsWith(`..${sep}`) ||
      pathRelative === '..'
    ) {
      throw new Error('Private storage key is outside the configured root');
    }
    return resolved;
  }
}

function isSafeStorageSegment(value: string): boolean {
  return (
    value !== '' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    value !== '.' &&
    value !== '..'
  );
}
