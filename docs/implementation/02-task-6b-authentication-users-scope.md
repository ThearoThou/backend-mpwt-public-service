# Task 6B — authentication and users scope

## 1. Purpose and boundary

Task 6B implements the approved authentication and user-management foundation
for the MPWT Vehicle Inspection Renewal Service. It follows the approved
refresh-session schema, migration, environment validation, workflow rules, and
REST contract. It is limited to the 13 endpoints below and their directly
required DTOs, guards, mappings, transactions, and tests.

Task 6B is not authorization or workflow implementation for vehicles,
applications, documents, scheduling, payments, inspections, stickers,
notifications, files, or audit-log read routes. It does not add new error
codes, enums, tables, package alternatives, or frontend behavior.

## 2. Endpoint scope

| # | Route | Access | Transactional |
| --- | --- | --- | --- |
| 1 | `POST /auth/register` | Public | Yes |
| 2 | `POST /auth/verify` | Public | Yes |
| 3 | `POST /auth/resend-verification` | Public | No |
| 4 | `POST /auth/login` | Public | Yes |
| 5 | `POST /auth/password-reset/request` | Public | No |
| 6 | `POST /auth/password-reset/confirm` | Public | Yes |
| 7 | `POST /auth/refresh` | Refresh cookie/session | Yes |
| 8 | `POST /auth/logout` | Refresh cookie/session when present | Yes |
| 9 | `GET /users/me` | Active `CITIZEN` or `ADMIN`, self | No |
| 10 | `PATCH /users/me/citizen-profile` | Active `CITIZEN`, self | No |
| 11 | `GET /admin/users` | Active `ADMIN` | No |
| 12 | `GET /admin/users/:userId` | Active `ADMIN` | No |
| 13 | `PATCH /admin/users/:userId/status` | Active `ADMIN` | Yes |

The endpoint inventory remains 77 total: 6 public, 2 refresh-cookie/session,
4 authenticated shared, 28 citizen-only, and 37 admin-only. Task 6B owns the
eight Auth routes and five Users routes shown here, not the full release.

## 3. Packages and implementation restrictions

Before coding, inspect and approve/install only the following packages if they
are absent:

- `@nestjs/jwt` for JWT signing and verification;
- `argon2`, using Argon2id for passwords and verification codes (and the
  approved refresh-token hash comparison); and
- minimal cookie parsing support only if Nest/Express does not already expose
  the needed request cookie safely.

Do not add Passport. Do not add OAuth, social login, biometric login, external
identity providers, a generic identity platform, or a device-management
library. Do not install packages during the authentication-design update that
precedes Task 6B.

## 4. Authentication architecture

### Access and refresh credentials

- Access tokens are signed with `JWT_ACCESS_SECRET`, have a maximum lifetime
  of 30 minutes (`JWT_ACCESS_EXPIRES_IN=30m`), and are returned only as the
  existing Bearer `AuthTokenResponse.accessToken`. When issuing or refreshing
  near the fixed seven-day session deadline, their expiry must not exceed the
  refresh session's `expiresAt`.
- Every access-token claim set contains `sub` (user UUID), `role` (`UserRole`),
  `sid` (the refresh-session UUID), and `typ: 'access'`; standard JWT `iat`
  and `exp` are issued by the signing library. `sid` is an identifier, not a
  secret. Do not place password, token hash, verification code, cookie, or
  authorization header in claims.
- Refresh tokens are signed with the separate `JWT_REFRESH_SECRET`, carry
  `sub` (user UUID), a non-secret random `sid` (refresh-session UUID), and
  `typ: 'refresh'`, and have an `exp` equal to the session's initial fixed
  seven-day deadline. The signed `sid` is the safe session lookup key and is
  intentionally contained inside the signed access-token and refresh-token JWT
  claims; it is never returned as a separate JSON response property.
- PostgreSQL stores only `RefreshSession.tokenHash`, never an access token,
  raw refresh token, cookie value, password, verification code, or request
  header. `tokenHash` remains non-selected by default.
- Raw refresh tokens, refresh-cookie values, token hashes, revocation data,
  and standalone session IDs are never returned in JSON.

### Refresh-session persistence and rotation

Login and successful verification create one `refresh_sessions` row per
device/browser with a new UUID, Argon2id hash, and `expiresAt = initialLoginOrVerification + 7 days`. Multiple rows for one user are allowed.

`POST /auth/refresh` has no JSON request body. Its transactional algorithm is:

1. Read only the named refresh cookie; missing/invalid credentials use the
   non-disclosing `401 AUTH_TOKEN_INVALID` response.
2. Verify the refresh signature and `typ`, extract the signed `sid`, and lock
   that `refresh_sessions` row (`FOR UPDATE` or equivalent) inside the same
   transaction.
3. Verify the signed `sub`, row user, user `ACTIVE` status, Argon2id hash,
   original `expiresAt`, JWT expiry, and unrevoked state. A disabled account
   returns `AUTH_ACCOUNT_DISABLED`; every other missing/invalid/expired/revoked
   /reused case returns the same `AUTH_TOKEN_INVALID` response.
4. If the JWT is valid enough to identify a locked row but its raw credential
   does not match the stored hash, record `reuseDetectedAt`, set `revokedAt`,
   set the internal revocation reason, and revoke only that session. Return
   `AUTH_TOKEN_INVALID` without revealing reuse.
5. Generate a new raw refresh token for the same `sid` and same original
   expiry, replace `tokenHash`, update `lastUsedAt`, issue a new access token
   whose expiry does not exceed that session's `expiresAt`, commit, and send
   the rotated cookie.

Rotation never creates a new session row and never extends `expiresAt`.
Cleanup jobs may use the expiry index later; no cleanup endpoint is added.

### Cookie policy

- The refresh token is sent only in a cookie, never in JSON.
- `HttpOnly` is always true and is not an environment setting.
- `Secure` is controlled by `REFRESH_COOKIE_SECURE` and must be true in
  production.
- `SameSite` is `lax` by default; validation permits only `lax` or `strict`.
- Derive the path from `API_PREFIX` and constrain it to the auth path where
  practical (normally `<API_PREFIX>/auth`); do not duplicate a cookie path in
  environment configuration.
- A rotated cookie's expiry/max-age uses only the remaining time until the
  row's original fixed `expiresAt`.
- Logout always clears the same cookie attributes/path even if no valid session
  can be found. Do not configure a frontend origin until the government-portal
  origin is approved.

## 5. Session creation and revocation rules

| Event | Required session effect |
| --- | --- |
| Successful registration verification | Create one refresh session, return an access token bound to that session in `AuthTokenResponse`, set cookie. |
| Successful citizen/admin login | Update `lastLoginAt`, create one refresh session, return an access token bound to that session in `AuthTokenResponse`, set cookie. |
| Successful refresh | Rotate token/hash on the same session, update `lastUsedAt`, preserve fixed expiry, issue an access token that expires no later than the session, set rotated cookie. |
| Current logout | Revoke only the matching current session when valid, immediately blocking its bound access tokens, then clear cookie. It is idempotent. Logging out one device does not affect another active device session. |
| Rotated-token reuse | Mark reuse and revoke only the affected session, immediately blocking its bound access tokens. |
| Password-reset confirmation | Revoke all active sessions for the user in the same transaction, immediately blocking all access tokens bound to those sessions; do not create one. |
| Admin sets status to `DISABLED` | Revoke all active sessions in the existing status transaction, immediately blocking all access tokens bound to those sessions. |
| Admin sets status to `ACTIVE` | Do not restore or create sessions. |

No refresh-session list, current-device display, device-management action,
logout-all endpoint, or account activation session restoration is in scope.

## 6. Guards, current user, and module direction

For every protected request, the future access-token guard verifies the JWT
signature and expiry, `typ = 'access'`, that the user still exists and is
`ACTIVE`, that `sid` belongs to that user, and that the refresh session is not
revoked or expired. It places only the necessary claims on the request. A roles
guard handles broad admin access; service/policy methods enforce citizen
ownership later in feature work. `CurrentUser` exposes only a safe current-user
shape, never JWT/cookie secrets.

`AuthModule` owns `RefreshSession` and a narrow transaction-aware
`RefreshSessionRevocationService`. To avoid an Auth/Users cycle, place that
service in an Auth-owned leaf persistence module that depends on database
entities only. `UsersModule` imports that leaf service to revoke sessions in
the status transaction; `AuthModule` may import `UsersModule` only for narrow
login/verification user operations. Do not use `forwardRef`.

Admin bootstrap remains a controlled one-time CLI or explicitly gated startup
process. It creates an `ADMIN` account only from approved bootstrap
configuration and is never a public registration route.

## 7. DTOs, mappings, and responses

Implement only the approved request DTOs: `RegisterRequest`,
`VerifyAccountRequest`, `ResendVerificationRequest`, `LoginRequest`,
`PasswordResetRequest`, `PasswordResetConfirmRequest`,
`UpdateCitizenProfileRequest`, `UpdateUserStatusRequest`, and approved list
query DTOs. `POST /auth/refresh` and `POST /auth/logout` deliberately have no
JSON request DTO or body.

Reuse the documented `RegistrationResponse`, `AuthTokenResponse`,
`CurrentUserResponse`, `CitizenProfileResponse`, and safe `UserSummary`
mappings. `AuthTokenResponse` contains the session-bound Bearer access token,
token type, actual `expiresIn` (at most `1800` seconds), and safe user summary
only. The non-secret `sid` remains inside the signed access-token JWT, not a
separate JSON response property. Mappers must not return raw refresh tokens,
refresh-cookie values, token hashes, revocation data, standalone session IDs,
passwords, or verification codes.

## 8. Required transaction boundaries

1. Registration creates the pending user/profile and hashed registration code.
2. Verification consumes the code, activates/timestamps the user, creates a
   session, and only then returns the token/cookie response.
3. Login verifies credentials/active status, updates `lastLoginAt`, and creates
   the session together.
4. Refresh locks/validates the matching row, detects/revokes reuse when
   applicable, or rotates hash/usage without extending expiry.
5. Logout revokes only a valid current session and completes cookie clearing
   idempotently without existence disclosure.
6. Reset confirmation replaces the password hash, consumes the reset code, and
   revokes all active sessions together.
7. Admin status update disables the user and revokes all active sessions in one
   transaction; an activate update restores none.

## 9. Test scope

- Unit-test identifier normalization, password/code hashing boundaries, token
  claim typing, cookie-option construction, session-expiry calculation, and
  response mapping/redaction.
- Service tests cover login/verification session creation, session-bound
  access-token claims and expiry clamping, concurrent-device isolation,
  fixed expiry during refresh, same-row rotation, reuse detection, idempotent
  logout, password-reset all-session revocation, account-disable all-session
  revocation, and no restoration on activation.
- PostgreSQL integration tests apply all three migrations and exercise the
  refresh-session foreign key, checks, partial active-user index, expiry index,
  and transaction lock/rotation behavior.
- E2E tests cover the 13 scoped routes, cookie-only refresh/logout, no refresh
  token in JSON, `AUTH_TOKEN_INVALID` non-disclosure cases, protected-request
  rejection for revoked/expired/mismatched-session access tokens, disabled-user
  handling, DTO validation, citizen self-only behavior, and admin role
  restrictions.
- Preserve the exact 55 API error codes and its count test. Add no
  refresh-session-specific public error code.

## 10. Exact out-of-scope items

- Passport, OAuth, social login, biometric login, and external identity
  providers.
- Session listing/device management, logout-all, session restoration, and a
  public user-delete route.
- Vehicle, application, document, scheduling, payment, inspection, sticker,
  notification, file, and audit-log feature endpoints.
- Frontend pages, frontend cookie-origin configuration, Docker changes, raw
  secret changes, migration resets, schema synchronization, and package
  alternatives.

## 11. Implementation order and done criteria

1. Inspect/install the approved minimal packages; retain current error and
   response conventions.
2. Add token/Argon2id/cookie configuration consumers and typed claims without
   exposing raw credentials.
3. Implement narrow user/profile repositories and refresh-session persistence
   with transaction-manager support and no module cycle.
4. Implement register, verification/resend, login, reset, refresh, and logout
   in the approved order, with response mappers and cookies.
5. Add access/active-user/role/current-user helpers, then the five Users
   routes and controlled admin bootstrap.
6. Add unit, integration, and e2e coverage; run build, unit/e2e tests, lint,
   migration show/run against an isolated available database, and diff checks.

Task 6B is done only when all 13 routes match the 77-endpoint contract,
state-changing session operations are transactionally enforced, and
protected-request guards verify the user and associated session. Ordinary
guard/session reads do not require a transaction unless a specific operation
requires locking. The refresh cookie is never a JSON field, the 55-code catalog
is unchanged, no Passport is present, no session management/logout-all route
exists, and the scoped tests pass.
