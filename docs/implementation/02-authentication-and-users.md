# Authentication and users

## Scope

Authentication and user management are implemented as session-bound JWT
authentication. `AuthModule` owns credentials, verification codes, token
creation, refresh sessions, refresh-cookie behavior, and controlled initial
admin bootstrap. `UsersModule` owns users, citizen profiles, current-user
responses, profile updates, and admin user management.

The public route contract is in [`docs/api/02-rest-api-contracts.md`](../api/02-rest-api-contracts.md).
This document records how the implementation works internally.

## Accounts and roles

The persisted roles are `CITIZEN`, `ADMIN`, and reserved `STAFF`; only citizen
and admin flows are currently usable. User status is
`PENDING_VERIFICATION`, `ACTIVE`, or `DISABLED`. The database requires at
least one phone or email and makes each identifier unique.

Public registration creates a `CITIZEN` user in `PENDING_VERIFICATION` and a
one-to-one citizen profile in the same transaction. The registration DTO
accepts a normalized Cambodian phone number and/or normalized email, a
password, Khmer and English names, and optional national ID/address. When both
identifiers are supplied, `verificationIdentifier` chooses which submitted
destination receives the registration code.

The password hash, verification-code hash, and refresh-token hash are never
selected for normal responses. Current-user and admin-user mappers return only
safe user/profile fields; a profile image key is not converted into a URL
because no profile-image route exists.

## Registration and verification codes

`AuthService.register` normalizes identifiers, checks conflicts, creates the
pending user/profile, and creates a hashed `REGISTER_ACCOUNT` verification
code. Verification codes have destination, purpose, expiry, used time, and
attempt count. Code validation occurs while the relevant user/code state is
locked inside a transaction.

Verification:

1. resolves a pending citizen by the normalized identifier;
2. validates the latest eligible registration code, including expiry, use, and
   attempt handling;
3. records the matching phone or email verification time and activates the
   citizen;
4. consumes the code and creates a refresh session; and
5. returns an access-token response after the transaction succeeds.

Resending verification is intentionally non-disclosing for absent, non-citizen,
or non-pending accounts. Password-reset request follows the same safe pattern:
it may create a hashed `RESET_PASSWORD` code for a known user without exposing
whether the identifier exists. A plaintext development code is returned only
outside production when `EXPOSE_DEVELOPMENT_VERIFICATION_CODE` is enabled; it
is never persisted as plaintext.

## Login, tokens, and refresh sessions

Login resolves a normalized phone/email, verifies the password hash, requires
an `ACTIVE` citizen or admin, records `lastLoginAt`, and creates a distinct
refresh session in one transaction. A dummy hash comparison is used when a
user is absent to reduce observable credential-check differences.

Access and refresh tokens use separate configured secrets. Access tokens carry
`sub`, `role`, `sid`, and `typ: 'access'`; `sid` is the non-secret refresh
session identifier. Access-token expiry is capped by both the access-token
lifetime and the session's fixed expiry. Refresh sessions store only the
refresh-token hash and include expiry, use, revocation, revocation reason, and
reuse-detection moments.

Refresh is cookie-only. The controller rejects a JSON request body, reads the
HttpOnly cookie, verifies the signed refresh token, locks the referenced
session, checks user/session ownership, status, expiry, revocation, and token
hash, then rotates the hash on the same session row. Rotation does not extend
the original session expiry. A reused rotated token marks the session reused
and revokes it; the response remains the safe `AUTH_TOKEN_INVALID` form.

Refresh cookies are HttpOnly, use `Secure` in production, default to
`SameSite=Lax`, and are scoped from the API prefix. Raw refresh tokens and
session IDs are not response fields.

## Revocation and disabled users

Logout is idempotent. When the refresh cookie is valid, it revokes only that
session; the controller always clears the cookie. Password reset confirmation
replaces the password hash, consumes the reset code, and revokes all active
sessions for the user in one transaction.

An admin may change another user's status only between `ACTIVE` and
`DISABLED`. Self-status changes and invalid status transitions are rejected.
Disabling locks the user, revokes all active sessions in the same transaction,
and writes a `USER_STATUS_UPDATED` audit row. Re-enabling does not restore a
session. The access-token guard rechecks user activity and the backing session
on every protected request, so revoked/expired sessions and disabled users lose
access immediately.

## Guards and authorization boundary

`AccessTokenGuard` creates the authenticated actor only after token/session/user
validation. `@Roles` and `RolesGuard` enforce broad controller roles. Resource
ownership remains a service responsibility: application, document, vehicle,
and scheduling services load records under their allowed scope rather than
trusting client-supplied IDs.

`GET /users/me` serves active citizens and admins. `PATCH /users/me/citizen-profile`
is citizen-only and updates only the supported profile fields. Admin routes
list users with validated filters, retrieve a safe user detail, and update the
status as described above.

## Bootstrap administrator

At application startup `AdminBootstrapService` checks the explicit bootstrap
configuration. When enabled and no administrator exists, it validates the
configured email/password (and optional phone), hashes the password, and
creates an `ACTIVE` admin in a transaction. It never overwrites an existing
administrator and is not a public registration mechanism.

## DTO and security rules

- Identifier DTOs normalize valid phone/email input and reject unsupported
  values; codes are exactly six digits; passwords are 8–128 characters.
- Refresh/logout have no accepted JSON request body.
- Validation whitelists fields and rejects unknown input globally.
- Errors use domain codes such as `AUTH_INVALID_CREDENTIALS`,
  `AUTH_TOKEN_INVALID`, and verification-code outcomes without exposing token
  hashes or account/session existence beyond the implemented contract.
- Passport, OAuth/social login, biometrics, session listing, logout-all, and
  session restoration are not implemented.

## Tests

Auth and user unit/e2e coverage exercises identifier normalization, hashing,
verification-code validation, token claims/expiry, cookie construction,
refresh-session rotation/reuse/revocation, bootstrap behavior, disabled-user
handling, safe response mapping, profile updates, role restrictions, and the
HTTP auth/user controllers. The guard and session tests verify that a session
revocation immediately invalidates access tokens bound to it.
