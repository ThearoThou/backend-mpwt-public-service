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

  it('requires separate Latin name parts and normalizes repeated spaces', async () => {
    const joinedName = plainToInstance(UpdateCitizenProfileRequestDto, {
      nameEn: 'SokDara',
    });
    const separatedName = plainToInstance(UpdateCitizenProfileRequestDto, {
      nameEn: '  Sok   Dara Neath  ',
    });

    await expect(validate(joinedName)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'nameEn' })]),
    );
    expect(separatedName.nameEn).toBe('Sok Dara Neath');
    await expect(validate(separatedName)).resolves.toHaveLength(0);
  });
});
