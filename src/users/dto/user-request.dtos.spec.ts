import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateCitizenProfileRequestDto } from './user-request.dtos';

describe('UpdateCitizenProfileRequestDto', () => {
  it('requires Khmer name while allowing English name to be cleared', async () => {
    const clearKhmerName = plainToInstance(UpdateCitizenProfileRequestDto, {
      nameKh: '   ',
    });
    const invalidKhmerName = plainToInstance(UpdateCitizenProfileRequestDto, {
      nameKh: 'John Smith',
    });
    const nullKhmerName = plainToInstance(UpdateCitizenProfileRequestDto, {
      nameKh: null,
    });
    const clearEnglishName = plainToInstance(UpdateCitizenProfileRequestDto, {
      nameEn: '   ',
    });

    expect(clearKhmerName.nameKh).toBe('');
    expect(clearEnglishName.nameEn).toBeNull();
    await expect(validate(clearKhmerName)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'nameKh' })]),
    );
    await expect(validate(invalidKhmerName)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'nameKh' })]),
    );
    await expect(validate(nullKhmerName)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'nameKh' })]),
    );
    await expect(validate(clearEnglishName)).resolves.toHaveLength(0);
  });
});
