import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';

export interface StoredPrivateFile {
  storageKey: string;
}

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
    const storageKey = `application-documents/${applicationId}/${randomUUID()}.${extension}`;
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
