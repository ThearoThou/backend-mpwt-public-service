import { validateEnvironment } from './environment.validation';

const validEnvironment = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'database-password',
  DB_NAME: 'mpwt_test',
  JWT_ACCESS_SECRET: 'access-secret-for-test-only',
  JWT_ACCESS_EXPIRES_IN: '30m',
  JWT_REFRESH_SECRET: 'refresh-secret-for-test-only',
  JWT_REFRESH_EXPIRES_IN: '7d',
  FRONTEND_ORIGIN: 'http://localhost:3001',
};

describe('environment validation', () => {
  it('accepts the approved refresh-session configuration', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      JWT_ACCESS_EXPIRES_IN: '30m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      FRONTEND_ORIGIN: 'http://localhost:3001',
      REFRESH_COOKIE_NAME: 'mpwt_refresh',
      REFRESH_COOKIE_SECURE: false,
      REFRESH_COOKIE_SAME_SITE: 'lax',
      VERIFICATION_CODE_TTL_SECONDS: 60,
      VERIFICATION_CODE_MAX_ATTEMPTS: 5,
      EXPOSE_DEVELOPMENT_VERIFICATION_CODE: false,
      ADMIN_BOOTSTRAP_ENABLED: false,
    });
  });

  it('requires a frontend origin for credentialed CORS', () => {
    const withoutFrontendOrigin = { ...validEnvironment };

    delete withoutFrontendOrigin.FRONTEND_ORIGIN;

    expect(() => validateEnvironment(withoutFrontendOrigin)).toThrow(
      'FRONTEND_ORIGIN',
    );
  });

  it('requires distinct, non-placeholder access and refresh secrets', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_SECRET: '<replace-with-a-long-random-secret>',
      }),
    ).toThrow('JWT_ACCESS_SECRET');

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_REFRESH_SECRET: validEnvironment.JWT_ACCESS_SECRET,
      }),
    ).toThrow('must not be equal');
  });

  it('enforces approved token durations and cookie security', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_EXPIRES_IN: '1h',
      }),
    ).toThrow('JWT_ACCESS_EXPIRES_IN');

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        REFRESH_COOKIE_SAME_SITE: 'none',
      }),
    ).toThrow('REFRESH_COOKIE_SAME_SITE');

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        REFRESH_COOKIE_SECURE: 'false',
      }),
    ).toThrow('REFRESH_COOKIE_SECURE');
  });

  it('requires safe bootstrap credentials only when controlled bootstrap is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ADMIN_BOOTSTRAP_ENABLED: 'true',
      }),
    ).toThrow('ADMIN_BOOTSTRAP_EMAIL');

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ADMIN_BOOTSTRAP_ENABLED: 'true',
        ADMIN_BOOTSTRAP_EMAIL: 'admin@example.com',
        ADMIN_BOOTSTRAP_PASSWORD: '<replace-with-a-strong-password>',
      }),
    ).toThrow('ADMIN_BOOTSTRAP_PASSWORD');

    expect(
      validateEnvironment({
        ...validEnvironment,
        ADMIN_BOOTSTRAP_ENABLED: 'true',
        ADMIN_BOOTSTRAP_EMAIL: 'admin@example.com',
        ADMIN_BOOTSTRAP_PASSWORD: 'bootstrap-password',
      }),
    ).toMatchObject({
      ADMIN_BOOTSTRAP_ENABLED: true,
      ADMIN_BOOTSTRAP_EMAIL: 'admin@example.com',
    });
  });
});
