import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CertificateNumberDto } from './certificate-number.dto';

describe('CertificateNumberDto', () => {
  it('trims an ADMIN-supplied certificate number without inventing a format', async () => {
    const input = plainToInstance(CertificateNumberDto, {
      certificateNumber: '  2299922916447  ',
    });

    await expect(validate(input)).resolves.toHaveLength(0);
    expect(input.certificateNumber).toBe('2299922916447');
  });

  it.each(['', '   ', 'A'.repeat(101)])(
    'rejects an empty or overlength value: %s',
    async (certificateNumber) => {
      const input = plainToInstance(CertificateNumberDto, {
        certificateNumber,
      });
      await expect(validate(input)).resolves.not.toHaveLength(0);
    },
  );
});
