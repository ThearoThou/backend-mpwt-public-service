import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { IssueStickerDto } from './issue-sticker.dto';

describe('IssueStickerDto', () => {
  it('trims a valid sticker number and rejects blank or overlong values', async () => {
    const valid = plainToInstance(IssueStickerDto, {
      stickerNumber: '  ABC123  ',
    });
    expect(valid.stickerNumber).toBe('ABC123');
    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(IssueStickerDto, { stickerNumber: '   ' })),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(IssueStickerDto, { stickerNumber: 'A'.repeat(101) }),
      ),
    ).resolves.not.toHaveLength(0);
  });
});
