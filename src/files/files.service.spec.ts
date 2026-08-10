import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FilesService } from './files.service';

describe('FilesService', () => {
  let root: string;
  let service: FilesService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mpwt-files-'));
    service = new FilesService({ getOrThrow: () => root } as never);
  });

  afterEach(async () => rm(root, { recursive: true, force: true }));

  it('stores and reads an opaque application-document key', async () => {
    const stored = await service.saveApplicationDocument(
      'application-id',
      Buffer.from('pdf'),
      'pdf',
    );

    expect(stored.storageKey).toMatch(
      /^application-documents\/application-id\/[0-9a-f-]+\.pdf$/,
    );
    await expect(service.read(stored.storageKey)).resolves.toEqual(
      Buffer.from('pdf'),
    );
  });

  it('rejects traversal keys and safely cleans up stored files', async () => {
    await expect(service.read('../outside')).rejects.toThrow('outside');
    await expect(service.read('../../outside')).rejects.toThrow('outside');
    const stored = await service.saveApplicationDocument(
      'application-id',
      Buffer.from('content'),
      'png',
    );
    await service.deleteIfExists(stored.storageKey);
    await expect(service.read(stored.storageKey)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      service.deleteIfExists('missing/file.pdf'),
    ).resolves.toBeUndefined();
  });
});
