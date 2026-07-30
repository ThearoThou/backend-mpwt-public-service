export interface EnvironmentVariables {
  NODE_ENV: string;
  PORT: number;
  API_PREFIX: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_LOGGING: boolean;
}

function requiredString(
  environment: Record<string, unknown>,
  name: string,
): string {
  const value = environment[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Environment variable ${name} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(
  environment: Record<string, unknown>,
  name: string,
  defaultValue: string,
): string {
  const value = environment[name];

  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Environment variable ${name} must be a non-empty string.`);
  }

  return value.trim();
}

function port(
  environment: Record<string, unknown>,
  name: string,
  defaultValue?: number,
): number {
  const value = environment[name];

  if (value === undefined && defaultValue !== undefined) {
    return defaultValue;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`Environment variable ${name} must be an integer.`);
  }

  const parsedValue = Number(value);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    parsedValue > 65535
  ) {
    throw new Error(
      `Environment variable ${name} must be an integer between 1 and 65535.`,
    );
  }

  return parsedValue;
}

function boolean(
  environment: Record<string, unknown>,
  name: string,
  defaultValue: boolean,
): boolean {
  const value = environment[name];

  if (value === undefined) {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`Environment variable ${name} must be either true or false.`);
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): EnvironmentVariables {
  return {
    NODE_ENV: optionalString(environment, 'NODE_ENV', 'development'),
    PORT: port(environment, 'PORT', 3000),
    API_PREFIX: optionalString(environment, 'API_PREFIX', '/api/v1'),
    DB_HOST: requiredString(environment, 'DB_HOST'),
    DB_PORT: port(environment, 'DB_PORT'),
    DB_USERNAME: requiredString(environment, 'DB_USERNAME'),
    DB_PASSWORD: requiredString(environment, 'DB_PASSWORD'),
    DB_NAME: requiredString(environment, 'DB_NAME'),
    DB_LOGGING: boolean(environment, 'DB_LOGGING', false),
  };
}
