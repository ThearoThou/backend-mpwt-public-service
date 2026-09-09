import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  normalizeCambodianPhone,
  normalizeEmail,
  normalizeIdentifier,
} from '../identifier-normalization';
import {
  HasValidRegistrationIdentifiers,
  IsCambodianPhone,
  IsEnglishName,
  IsKhmerName,
  IsNormalizedEmail,
  IsSupportedIdentifier,
} from '../identifier-normalization.validators';

const CODE_PATTERN = /^\d{6}$/;

function normalizeWhenValid(
  normalizer: (value: string) => string,
): (params: { value: unknown }) => unknown {
  return ({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return normalizer(value);
    } catch {
      return value;
    }
  };
}

function normalizeOptionalEnglishName(params: { value: unknown }): unknown {
  if (typeof params.value !== 'string') return params.value;
  const value = params.value.trim();
  return value === '' ? null : value;
}

function trimString(params: { value: unknown }): unknown {
  return typeof params.value === 'string' ? params.value.trim() : params.value;
}

export class RegisterRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Transform(normalizeWhenValid(normalizeCambodianPhone))
  @IsCambodianPhone()
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  @Transform(normalizeWhenValid(normalizeEmail))
  @IsNormalizedEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  @Transform(normalizeWhenValid(normalizeIdentifier))
  @IsSupportedIdentifier()
  verificationIdentifier?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @IsKhmerName()
  @Transform(trimString)
  nameKh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @IsEnglishName()
  @Transform(normalizeOptionalEnglishName)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nationalIdNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @HasValidRegistrationIdentifiers()
  readonly identifiersValidation?: undefined;
}

export class VerifyAccountRequestDto {
  @IsString()
  @Transform(normalizeWhenValid(normalizeIdentifier))
  @IsSupportedIdentifier()
  identifier!: string;

  @IsString()
  @Matches(CODE_PATTERN, { message: 'code must be exactly six numeric digits' })
  code!: string;
}

export class ResendVerificationRequestDto {
  @IsString()
  @Transform(normalizeWhenValid(normalizeIdentifier))
  @IsSupportedIdentifier()
  identifier!: string;
}

export class LoginRequestDto {
  @IsString()
  @Transform(normalizeWhenValid(normalizeIdentifier))
  @IsSupportedIdentifier()
  identifier!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class PasswordResetRequestDto {
  @IsString()
  @Transform(normalizeWhenValid(normalizeIdentifier))
  @IsSupportedIdentifier()
  identifier!: string;
}

export class PasswordResetVerifyRequestDto {
  @IsString()
  @Transform(normalizeWhenValid(normalizeIdentifier))
  @IsSupportedIdentifier()
  identifier!: string;

  @IsString()
  @Matches(CODE_PATTERN, { message: 'code must be exactly six numeric digits' })
  code!: string;
}

export class PasswordResetConfirmRequestDto {
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  resetToken!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
