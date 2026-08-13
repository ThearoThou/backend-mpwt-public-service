import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FilesService, PaymentArtifactKind } from './files.service';

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

  it('stores payment PDFs in a separate generated-artifact namespace', async () => {
    const stored = await service.savePaymentArtifact(
      'application-id',
      'invoice',
      Buffer.from('%PDF-generated'),
    );

    expect(stored.storageKey).toMatch(
      /^payment-artifacts\/application-id\/invoice\/[0-9a-f-]+\.pdf$/,
    );
    expect(stored.storageKey).not.toContain('application-documents');
    await expect(service.read(stored.storageKey)).resolves.toEqual(
      Buffer.from('%PDF-generated'),
    );
    await service.deleteIfExists(stored.storageKey);
    await expect(service.read(stored.storageKey)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects unsafe payment artifact paths and non-PDF content', async () => {
    await expect(
      service.savePaymentArtifact(
        '../application-id',
        'invoice',
        Buffer.from('%PDF-1.7'),
      ),
    ).rejects.toThrow('application ID');
    await expect(
      service.savePaymentArtifact(
        'application-id',
        'invoice',
        Buffer.from('not a PDF'),
      ),
    ).rejects.toThrow('PDF');
    await expect(
      service.savePaymentArtifact(
        'application-id',
        'other' as PaymentArtifactKind,
        Buffer.from('%PDF-1.7'),
      ),
    ).rejects.toThrow('artifact kind');
  });
});
