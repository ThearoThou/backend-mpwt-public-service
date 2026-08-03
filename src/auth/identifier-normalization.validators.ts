import {
  type ValidationArguments,
  type ValidationOptions,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import {
  normalizeCambodianPhone,
  normalizeEmail,
  normalizeIdentifier,
  normalizeRegistrationIdentifiers,
} from './identifier-normalization';

@ValidatorConstraint({ name: 'isCambodianPhone', async: false })
class CambodianPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    try {
      return typeof value === 'string' && normalizeCambodianPhone(value) !== '';
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'phone must be a valid Cambodian phone number';
  }
}

@ValidatorConstraint({ name: 'isNormalizedEmail', async: false })
class NormalizedEmailConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    try {
      return typeof value === 'string' && normalizeEmail(value) !== '';
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'email must be a valid email address';
  }
}

@ValidatorConstraint({ name: 'isSupportedIdentifier', async: false })
class SupportedIdentifierConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    try {
      return typeof value === 'string' && normalizeIdentifier(value) !== '';
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'identifier must be a valid email or Cambodian phone number';
  }
}

@ValidatorConstraint({ name: 'hasValidRegistrationIdentifiers', async: false })
class RegistrationIdentifiersConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, arguments_: ValidationArguments): boolean {
    try {
      normalizeRegistrationIdentifiers(arguments_.object);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'phone/email identifiers and verificationIdentifier are invalid';
  }
}

export function IsCambodianPhone(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return Validate(CambodianPhoneConstraint, validationOptions);
}

export function IsNormalizedEmail(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return Validate(NormalizedEmailConstraint, validationOptions);
}

export function IsSupportedIdentifier(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return Validate(SupportedIdentifierConstraint, validationOptions);
}

export function HasValidRegistrationIdentifiers(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return Validate(RegistrationIdentifiersConstraint, validationOptions);
}
