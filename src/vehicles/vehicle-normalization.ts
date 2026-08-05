export class VehicleNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VehicleNormalizationError';
  }
}

export function canonicalizeVehicleIdentifier(value: string): string {
  return requireString(value, 'Vehicle identifier')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\p{Script=Latin}/gu, (character) => character.toUpperCase());
}

export function normalizeVehicleIdentifier(value: string): string {
  const normalized = canonicalizeVehicleIdentifier(value);

  if (normalized.length === 0) {
    throw new VehicleNormalizationError(
      'Vehicle identifier must not be blank.',
    );
  }

  return normalized;
}

export function trimRequiredVehicleText(value: string, label: string): string {
  const normalized = requireString(value, label).trim();

  if (normalized.length === 0) {
    throw new VehicleNormalizationError(`${label} must not be blank.`);
  }

  return normalized;
}

function requireString(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new VehicleNormalizationError(`${label} must be a string.`);
  }

  return value;
}
