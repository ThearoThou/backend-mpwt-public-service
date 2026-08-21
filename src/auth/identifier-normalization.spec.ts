import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RegisterRequestDto } from './dto/auth-request.dtos';
import {
  IdentifierNormalizationError,
  normalizeCambodianPhone,
  normalizeEmail,
  normalizeRegistrationIdentifiers,
} from './identifier-normalization';

describe('identifier normalization', () => {
  it('trims and lowercases valid email identifiers', () => {
    expect(normalizeEmail('  Citizen@Example.COM ')).toBe(
      'citizen@example.com',
    );
  });

  it('rejects invalid or overlong email identifiers', () => {
    expect(() => normalizeEmail('not-an-email')).toThrow(
      IdentifierNormalizationError,
    );
    expect(() => normalizeEmail(`${'a'.repeat(250)}@test.com`)).toThrow(
      IdentifierNormalizationError,
    );
  });

  it('normalizes local nine- and ten-digit Cambodian phone numbers', () => {
    expect(normalizeCambodianPhone('012 345 678')).toBe('+85512345678');
    expect(normalizeCambodianPhone('096-123-(4567)')).toBe('+855961234567');
  });

  it('accepts canonical international Cambodian phone numbers', () => {
    expect(normalizeCambodianPhone('+855 12 345 678')).toBe('+85512345678');
    expect(normalizeCambodianPhone('+855961234567')).toBe('+855961234567');
  });

  it('rejects invalid phone lengths, prefixes, and international numbers without +', () => {
    expect(() => normalizeCambodianPhone('01234567')).toThrow(
      IdentifierNormalizationError,
    );
    expect(() => normalizeCambodianPhone('112345678')).toThrow(
      IdentifierNormalizationError,
    );
    expect(() => normalizeCambodianPhone('85512345678')).toThrow(
      IdentifierNormalizationError,
    );
  });

  it('requires a normalized verification identifier when both identifiers are supplied', () => {
    expect(() =>
      normalizeRegistrationIdentifiers({
        phone: '012 345 678',
        email: 'Citizen@Example.com',
      }),
    ).toThrow(IdentifierNormalizationError);
    expect(() =>
      normalizeRegistrationIdentifiers({
        phone: '012 345 678',
        email: 'Citizen@Example.com',
        verificationIdentifier: 'other@example.com',
      }),
    ).toThrow(IdentifierNormalizationError);

    expect(
      normalizeRegistrationIdentifiers({
        phone: '012 345 678',
        email: 'Citizen@Example.com',
        verificationIdentifier: ' CITIZEN@example.COM ',
      }),
    ).toEqual({
      phone: '+85512345678',
      email: 'citizen@example.com',
      verificationIdentifier: 'citizen@example.com',
    });
  });

  it('validates registration DTO cross-field requirements after transformations', async () => {
    const validPhoneOnly = plainToInstance(RegisterRequestDto, {
      phone: '012 345 678',
      password: 'password1',
      nameKh: 'ណាមខ្មែរ',
      nameEn: 'Citizen Name',
    });
    const missingPhone = plainToInstance(RegisterRequestDto, {
      email: 'citizen@example.com',
      password: 'password1',
      nameKh: 'ណាមខ្មែរ',
      nameEn: 'Citizen Name',
    });
    const missingSelection = plainToInstance(RegisterRequestDto, {
      phone: '012 345 678',
      email: 'citizen@example.com',
      password: 'password1',
      nameKh: 'ណាមខ្មែរ',
      nameEn: 'Citizen Name',
    });

    expect(validPhoneOnly.phone).toBe('+85512345678');
    expect(await validate(validPhoneOnly)).toHaveLength(0);
    expect(await validate(missingPhone)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'phone' }),
        expect.objectContaining({ property: 'identifiersValidation' }),
      ]),
    );
    expect(await validate(missingSelection)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'identifiersValidation' }),
      ]),
    );
  });

  it('requires Khmer and English names to use their respective scripts', async () => {
    const invalidKhmerName = plainToInstance(RegisterRequestDto, {
      phone: '012 345 678',
      password: 'password1',
      nameKh: 'Citizen Name',
      nameEn: 'Citizen Name',
    });
    const invalidEnglishName = plainToInstance(RegisterRequestDto, {
      phone: '012 345 678',
      password: 'password1',
      nameKh: '\u1780\u1781',
      nameEn: '\u1780\u1781',
    });

    await expect(validate(invalidKhmerName)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'nameKh' })]),
    );
    await expect(validate(invalidEnglishName)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'nameEn' })]),
    );
  });
});
