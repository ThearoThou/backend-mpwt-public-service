import { AuthHashingService } from './auth-hashing.service';

describe('AuthHashingService', () => {
  const hashingService = new AuthHashingService();

  it('creates an Argon2id hash that does not expose the plaintext', async () => {
    const hash = await hashingService.hashSecret('correct-secret');

    expect(hash).toContain('$argon2id$');
    expect(hash).not.toBe('correct-secret');
  });

  it('verifies the correct value and rejects an incorrect value', async () => {
    const hash = await hashingService.hashSecret('correct-secret');

    await expect(
      hashingService.verifySecret(hash, 'correct-secret'),
    ).resolves.toBe(true);
    await expect(
      hashingService.verifySecret(hash, 'incorrect-secret'),
    ).resolves.toBe(false);
  });

  it('fails safely for a malformed stored hash', async () => {
    await expect(
      hashingService.verifySecret('not-an-argon2-hash', 'correct-secret'),
    ).resolves.toBe(false);
  });
});
