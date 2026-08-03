import { isEmail } from 'class-validator';

export const EMAIL_MAX_LENGTH = 254;

export class IdentifierNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentifierNormalizationError';
  }
}

export interface RegistrationIdentifiersInput {
  phone?: string;
  email?: string;
  verificationIdentifier?: string;
}

export interface NormalizedRegistrationIdentifiers {
  phone: string | null;
  email: string | null;
  verificationIdentifier: string;
}

export function normalizeEmail(value: string): string {
  const normalized = requireString(value, 'Email').trim().toLowerCase();

  if (normalized.length === 0 || normalized.length > EMAIL_MAX_LENGTH) {
    throw new IdentifierNormalizationError('Email has an invalid length.');
  }

  if (!isEmail(normalized)) {
    throw new IdentifierNormalizationError('Email has an invalid format.');
  }

  return normalized;
}

export function normalizeCambodianPhone(value: string): string {
  const compact = requireString(value, 'Phone').replace(/[ \-()]/g, '');

  if (/^0\d{8,9}$/.test(compact)) {
    return `+855${compact.slice(1)}`;
  }

  if (/^\+855\d{8,9}$/.test(compact)) {
    return compact;
  }

  throw new IdentifierNormalizationError('Phone has an invalid format.');
}

export function normalizeIdentifier(value: string): string {
  const candidate = requireString(value, 'Identifier').trim();

  return candidate.includes('@')
    ? normalizeEmail(candidate)
    : normalizeCambodianPhone(candidate);
}

export function normalizeRegistrationIdentifiers(
  input: RegistrationIdentifiersInput,
): NormalizedRegistrationIdentifiers {
  const phone =
    input.phone === undefined ? null : normalizeCambodianPhone(input.phone);
  const email = input.email === undefined ? null : normalizeEmail(input.email);

  if (phone === null && email === null) {
    throw new IdentifierNormalizationError(
      'At least one phone or email identifier is required.',
    );
  }

  if (phone !== null && email !== null) {
    if (input.verificationIdentifier === undefined) {
      throw new IdentifierNormalizationError(
        'verificationIdentifier is required when both identifiers are supplied.',
      );
    }

    const verificationIdentifier = normalizeIdentifier(
      input.verificationIdentifier,
    );

    if (verificationIdentifier !== phone && verificationIdentifier !== email) {
      throw new IdentifierNormalizationError(
        'verificationIdentifier must match a submitted identifier.',
      );
    }

    return { phone, email, verificationIdentifier };
  }

  return {
    phone,
    email,
    verificationIdentifier:
      phone ?? email ?? fail('A verification destination is required.'),
  };
}

export function tryNormalize<T>(
  value: unknown,
  normalize: (candidate: string) => T,
): T | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  try {
    return normalize(value);
  } catch (error) {
    if (error instanceof IdentifierNormalizationError) {
      return undefined;
    }

    throw error;
  }
}

function requireString(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new IdentifierNormalizationError(`${label} must be a string.`);
  }

  return value;
}

function fail(message: string): never {
  throw new IdentifierNormalizationError(message);
}
