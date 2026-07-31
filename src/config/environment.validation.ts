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
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: '30m';
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: '7d';
  REFRESH_COOKIE_NAME: string;
  REFRESH_COOKIE_SECURE: boolean;
  REFRESH_COOKIE_SAME_SITE: 'lax' | 'strict';
  VERIFICATION_CODE_TTL_SECONDS: number;
  VERIFICATION_CODE_MAX_ATTEMPTS: number;
  EXPOSE_DEVELOPMENT_VERIFICATION_CODE: boolean;
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

function requiredSecret(
  environment: Record<string, unknown>,
  name: string,
): string {
  const value = requiredString(environment, name);

  if (
    /^<[^>]+>$/.test(value) ||
    /^(?:replace(?:[-_ ]?(?:with|me))?.*|change[-_ ]?me|your[-_ ]?secret|example|placeholder)$/i.test(
      value,
    )
  ) {
    throw new Error(
      `Environment variable ${name} must not use a placeholder secret value.`,
    );
  }

  return value;
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

function positiveInteger(
  environment: Record<string, unknown>,
  name: string,
  defaultValue: number,
): number {
  const value = environment[name];

  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  return parsedValue;
}

function fixedDuration<T extends '30m' | '7d'>(
  environment: Record<string, unknown>,
  name: string,
  expectedValue: T,
): T {
  const value = requiredString(environment, name);

  if (value !== expectedValue) {
    throw new Error(
      `Environment variable ${name} must be the approved fixed duration ${expectedValue}.`,
    );
  }

  return expectedValue;
}

function refreshCookieSameSite(
  environment: Record<string, unknown>,
): 'lax' | 'strict' {
  const value = optionalString(environment, 'REFRESH_COOKIE_SAME_SITE', 'lax');

  if (value === 'lax' || value === 'strict') {
    return value;
  }

  throw new Error(
    'Environment variable REFRESH_COOKIE_SAME_SITE must be either lax or strict.',
  );
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): EnvironmentVariables {
  const NODE_ENV = optionalString(environment, 'NODE_ENV', 'development');
  const REFRESH_COOKIE_SECURE = boolean(
    environment,
    'REFRESH_COOKIE_SECURE',
    false,
  );

  if (NODE_ENV === 'production' && !REFRESH_COOKIE_SECURE) {
    throw new Error(
      'Environment variable REFRESH_COOKIE_SECURE must be true in production.',
    );
  }

  const JWT_ACCESS_SECRET = requiredSecret(environment, 'JWT_ACCESS_SECRET');
  const JWT_REFRESH_SECRET = requiredSecret(environment, 'JWT_REFRESH_SECRET');

  if (JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
    throw new Error(
      'Environment variables JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be equal.',
    );
  }

  return {
    NODE_ENV,
    PORT: port(environment, 'PORT', 3000),
    API_PREFIX: optionalString(environment, 'API_PREFIX', '/api/v1'),
    DB_HOST: requiredString(environment, 'DB_HOST'),
    DB_PORT: port(environment, 'DB_PORT'),
    DB_USERNAME: requiredString(environment, 'DB_USERNAME'),
    DB_PASSWORD: requiredString(environment, 'DB_PASSWORD'),
    DB_NAME: requiredString(environment, 'DB_NAME'),
    DB_LOGGING: boolean(environment, 'DB_LOGGING', false),
    JWT_ACCESS_SECRET,
    JWT_ACCESS_EXPIRES_IN: fixedDuration(
      environment,
      'JWT_ACCESS_EXPIRES_IN',
      '30m',
    ),
    JWT_REFRESH_SECRET,
    JWT_REFRESH_EXPIRES_IN: fixedDuration(
      environment,
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    ),
    REFRESH_COOKIE_NAME: optionalString(
      environment,
      'REFRESH_COOKIE_NAME',
      'mpwt_refresh',
    ),
    REFRESH_COOKIE_SECURE,
    REFRESH_COOKIE_SAME_SITE: refreshCookieSameSite(environment),
    VERIFICATION_CODE_TTL_SECONDS: positiveInteger(
      environment,
      'VERIFICATION_CODE_TTL_SECONDS',
      300,
    ),
    VERIFICATION_CODE_MAX_ATTEMPTS: positiveInteger(
      environment,
      'VERIFICATION_CODE_MAX_ATTEMPTS',
      5,
    ),
    EXPOSE_DEVELOPMENT_VERIFICATION_CODE: boolean(
      environment,
      'EXPOSE_DEVELOPMENT_VERIFICATION_CODE',
      false,
    ),
  };
}
