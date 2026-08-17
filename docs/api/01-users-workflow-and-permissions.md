# Users, workflow, and permissions

## Scope and source of truth

This document describes the backend that is currently implemented through
Phases 2, 3, 4, 5, 6, and 7. The source of truth is the NestJS controllers,
DTOs, services, entities, migrations, and automated tests. It does not describe
future online-provider payments, general appointment cancellation, or
rescheduling features as though they already exist.

The API prefix is configured by `API_PREFIX` and defaults to `/api`. Protected
routes use an active-session Bearer access token. The global validation pipe
transforms validated DTO fields, rejects unknown fields, and returns the shared
error envelope on validation failure.

## Actors and access

| Actor     | Implemented access                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CITIZEN` | Manages their profile and vehicles; creates and progresses only their own renewal applications; uploads/downloads their own application and available payment documents; sees active stations and selectable dates; sets a DRAFT preference; selects a replacement station/date when required; and reads the sticker-issuance status of their own renewal application.                                                                                                                             |
| `ADMIN`   | Lists and reads submitted applications and their document/status-history records; starts reviews, requests corrections, rejects, reopens, and performs review-pass; manages daily station capacities; initializes, reads, transitions, and downloads payment documents; records physical inspection PASS/FAIL results and manual NO_SHOW fallback; lists and reads sticker-issuance work and physically issues an eligible sticker number; and manages users, vehicles, and inspection categories. |
| `STAFF`   | Present in the role enum but has no implemented route or permission policy.                                                                                                                                                                                                                                                                                                                                                                                                                        |

Citizens cannot use admin routes or operate on another citizen's application.
Admins cannot use the citizen-only scheduling discovery or application mutation
routes. Ownership is checked in the application/document services, not supplied
by a caller-controlled request field.

## Authentication and users

The implemented authentication model remains unchanged:

- Public registration creates a `CITIZEN` account. Verification activates it.
- Login accepts a normalized phone number or email and requires an active
  account.
- Access tokens are session-bound Bearer tokens. Refresh credentials are held
  in an HttpOnly cookie; refresh and logout do not accept a JSON body.
- Password reset, logout, and disabling a user revoke the applicable active
  refresh session(s). A token whose session is revoked, expired, or belongs to
  a non-active user cannot access protected routes.
- `GET /api/users/me` is available to active citizens and admins. Only a
  citizen can update their own citizen profile.

The public auth routes are documented in the REST contract. The initial admin
is created only by the configured bootstrap process, never public registration.

### Authentication and session safeguards

- A user has `CITIZEN`, `ADMIN`, or reserved `STAFF` role and is
  `PENDING_VERIFICATION`, `ACTIVE`, or `DISABLED`. Normal protected work
  requires `ACTIVE`.
- A user must have at least one unique normalized phone number or email.
  `phoneVerifiedAt` and `emailVerifiedAt` are recorded independently.
- Registration creates a `PENDING_VERIFICATION` citizen, citizen profile, and
  a hashed `REGISTER_ACCOUNT` verification code. When both phone and email are
  supplied, `verificationIdentifier` selects the submitted destination.
- Verification codes are purpose-specific, expiring, single-use, and
  attempt-limited. They are stored only as hashes. Local development may expose
  a development code only when explicitly configured; production-style
  responses do not expose plaintext codes.
- Verification creates an active account and a refresh session. Login requires
  valid credentials and an active account, then creates a separate session for
  that browser/device.
- Access tokens contain `sub`, `role`, `sid`, and `typ: 'access'`. `sid` is a
  non-secret session identifier. The guard verifies signature, expiry, token
  type, active user, session ownership, and that the backing refresh session is
  neither revoked nor expired.
- Refresh rotation locks and validates the session, rotates the stored token
  hash without extending the original expiry, and returns a replacement access
  token plus cookie. Reuse of a rotated refresh token revokes that session.
- Logout revokes only the current refresh session and clears the cookie.
  Password reset revokes all active sessions for that user. Disabling a user
  also revokes all active sessions in the same transaction; reactivation does
  not restore a session.
- Raw refresh tokens, password hashes, verification-code hashes, and
  revocation metadata are not returned in JSON. There is no public admin
  registration, OAuth, social login, biometric login, or external identity
  provider integration.

## Renewal application lifecycle

### Status enum

`application_status` contains the following persisted values:

`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CORRECTION_REQUIRED`,
`APPOINTMENT_SELECTION_REQUIRED`, `APPROVED`, `REJECTED`,
`REINSPECTION_REQUIRED`, `CANCELLED`, `INSPECTION_FAILED`, and `COMPLETED`.

The presence of an enum value is not an endpoint contract. In particular,
there is currently no implemented route that transitions an application to
`REINSPECTION_REQUIRED`, and Phase 4 adds no rescheduling, cancellation, or
reinspection behavior for scheduled daily-capacity appointments. Phase 6
intentionally does not use `REINSPECTION_REQUIRED`. A Phase 6 PASS leaves the
application `APPROVED` and sticker eligible; Phase 7 sticker issuance performs
the final `APPROVED → COMPLETED` transition.

### Implemented transitions

| From                                                                             | To                               | Actor / operation                | Implemented rule                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------- | -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New                                                                              | `DRAFT`                          | Citizen creates application      | The vehicle must exist, belong to the citizen, and have no unfinished application. Reference number and snapshots are initially `null`; a `null → DRAFT` status-history row is written.                                                                                                                                                                     |
| `DRAFT`                                                                          | `SUBMITTED`                      | Citizen submits                  | All three current required documents must exist and none may be rejected; a citizen profile and vehicle must exist; a preferred active, future, open, non-full station/date must be selected. Submission creates snapshots and reference number, revalidates the preference, and writes history. It does **not** reserve capacity or create an appointment. |
| `CORRECTION_REQUIRED`                                                            | `SUBMITTED`                      | Citizen resubmits                | Required current documents must exist and no required document may remain rejected. The service validates the existing submission data and writes history.                                                                                                                                                                                                  |
| `SUBMITTED`                                                                      | `UNDER_REVIEW`                   | Admin starts review              | Sets `reviewStartedAt` if it has not been set, clears current correction/rejection reason fields, and writes history.                                                                                                                                                                                                                                       |
| `UNDER_REVIEW`                                                                   | `CORRECTION_REQUIRED`            | Admin requests correction        | The request names one or more document types and a reason. Current named documents become `REJECTED`; other current documents become `APPROVED`; correction reason and history are recorded.                                                                                                                                                                |
| `UNDER_REVIEW`                                                                   | `REJECTED`                       | Admin rejects                    | Requires a reason; records current rejection reason, history, and an audit row.                                                                                                                                                                                                                                                                             |
| `REJECTED`                                                                       | `UNDER_REVIEW`                   | Admin reopens                    | Requires a reason; clears the rejection reason and records history and an audit row.                                                                                                                                                                                                                                                                        |
| `UNDER_REVIEW`                                                                   | `APPROVED`                       | Admin review-pass                | Atomically reserves the stored preferred daily capacity, creates one `SCHEDULED` appointment using `daily_capacity_id`, updates status, and writes history.                                                                                                                                                                                                 |
| `UNDER_REVIEW`                                                                   | `APPOINTMENT_SELECTION_REQUIRED` | Admin review-pass fallback       | If the preferred capacity cannot be reserved, writes the fallback status and history only. It creates no appointment and does not change the capacity counter.                                                                                                                                                                                              |
| `APPOINTMENT_SELECTION_REQUIRED`                                                 | `APPROVED`                       | Citizen appointment selection    | Atomically reserves the citizen's selected daily capacity, replaces the stored preference, creates one `SCHEDULED` daily-capacity appointment, updates status, and writes history.                                                                                                                                                                          |
| `DRAFT`, `SUBMITTED`, `CORRECTION_REQUIRED`, or `APPOINTMENT_SELECTION_REQUIRED` | `CANCELLED`                      | Citizen cancellation             | The citizen may cancel only their own application in one of these states. The optional reason and history are recorded. No Phase 4 daily-capacity release or appointment cancellation is implemented by this operation.                                                                                                                                     |
| `APPROVED`                                                                       | `APPROVED`                       | Attempt 1/2 PASS                 | With confirmed payment and an eligible daily-capacity appointment, an ADMIN records PASS. The application stays APPROVED and is sticker eligible.                                                                                                                                                                                                           |
| `APPROVED`                                                                       | `COMPLETED`                      | ADMIN sticker issuance           | For exactly one completed PASS on a daily-capacity appointment, issuance creates one Sticker, sets `completedAt`, and records `STICKER_ISSUED` history atomically.                                                                                                                                                                                          |
| `APPROVED`                                                                       | `APPROVED`                       | Attempt 1 FAIL                   | An ADMIN records FAIL with a required reason. Reinspection is required; Phase 6 does not use `REINSPECTION_REQUIRED`.                                                                                                                                                                                                                                       |
| `APPROVED`                                                                       | `INSPECTION_FAILED`              | Attempt 2 FAIL or expiry         | A second actual FAIL uses `SECOND_INSPECTION_FAILED`; missing the Attempt-1-FAIL reinspection completion deadline uses `REINSPECTION_DEADLINE_EXPIRED`.                                                                                                                                                                                                     |
| `APPROVED`                                                                       | `APPROVED`                       | First NO_SHOW before FAIL        | A missed appointment creates no inspection attempt and permits replacement booking until the first-NO_SHOW booking deadline.                                                                                                                                                                                                                                |
| `APPROVED`                                                                       | `CANCELLED`                      | Second NO_SHOW or booking expiry | The second NO_SHOW uses `NO_SHOW_LIMIT_REACHED`; missing the first-NO_SHOW booking deadline uses `NO_SHOW_REBOOKING_DEADLINE_EXPIRED`.                                                                                                                                                                                                                      |

Every listed state-changing service executes in a database transaction and
rejects an invalid source state with `APPLICATION_INVALID_TRANSITION`. There is
no standalone admin “approve” endpoint that merely changes status: the only
approval operation is review-pass and it owns reservation, appointment,
application transition, and history in one transaction.

## Documents

The required document enum is exactly:

- `VEHICLE_REGISTRATION_CARD`
- `PREVIOUS_INSPECTION_CERTIFICATE`
- `CITIZEN_ID_CARD`

`NATIONAL_ID` is not a valid current document type.

Citizens upload documents separately from application creation. Upload is
allowed only while the application is `DRAFT` or `CORRECTION_REQUIRED`.

- In `DRAFT`, a current document type cannot be uploaded twice.
- In `CORRECTION_REQUIRED`, only a current rejected document may be replaced.
- A replacement makes the previous version non-current, increments its version
  number, and begins with `PENDING` document status.
- The accepted file forms are PDF, JPG/JPEG, and PNG, with matching MIME type,
  non-zero size, and a maximum size of 5 MiB.

Citizen document list/download/history routes enforce ownership. Admins have
read-only current-document, history, and download routes. There is no separate
admin document-review endpoint; document outcomes are currently written by the
admin request-correction operation.

## Phase 4 scheduling workflow

Phase 4 scheduling selects a station and a calendar date; it is not a new
citizen hourly time-slot booking flow.

1. A citizen lists active stations and their selectable dates. A date is
   selectable only when its station is active, the Cambodia-local date is in
   the future, the capacity is open, and `reserved_count < daily_capacity`.
2. While an application is `DRAFT`, the citizen saves exactly one paired
   station/date preference. This validates availability but does not reserve
   capacity or create an appointment.
3. Submission repeats the availability validation but still does not reserve.
4. Review-pass attempts the reservation. Success produces `APPROVED` and one
   appointment. An unavailable preference produces
   `APPOINTMENT_SELECTION_REQUIRED` with no appointment.
5. A citizen in `APPOINTMENT_SELECTION_REQUIRED` selects a new available
   station/date. The successful operation reserves it and reaches `APPROVED`.

An administrator can create, list, retrieve, change the total daily capacity,
close, and reopen daily-capacity rows. Admins never set `reserved_count`.
Closing a row stops new reservations but does not release existing consumed
capacity. `reserved_count` is a consumed-unit counter: `COMPLETED` and
`NO_SHOW` appointments are not a reason to recompute or release it.

## Appointment compatibility

`appointment_slots` remains in the database for legacy compatibility. The
current Phase 4 flow does not expose new slot-management, slot-selection, or
appointment-management HTTP endpoints.

The `appointments` table supports exactly one scheduling source per row:

- legacy appointment: `slot_id` populated and `daily_capacity_id` `NULL`;
- Phase 4 appointment: `slot_id` `NULL` and `daily_capacity_id` populated.

Phase 4 creates `SCHEDULED` appointments only. The retained partial unique
constraint allows at most one scheduled appointment per application. There is
currently no appointment read response or standalone appointments route; the
appointment is an internal result of successful scheduling orchestration.

## Phase 5 payment workflow

After review-pass or citizen replacement selection commits an `APPROVED`
application with one `SCHEDULED` appointment, payment initialization is
attempted. It is idempotent and creates at most one Payment/invoice per
application. If initialization fails, scheduling remains committed and an
admin may retry it.

The only functional MVP method is `PAY_AT_STATION`; `BANK_QR` and `BANK_CARD`
are reserved enum values. A payment uses `PENDING`, `CONFIRMED`, `FAILED`, or
`REJECTED` status. Admins can confirm or reject `PENDING`, and can reopen a
rejected payment to `PENDING` or confirm it. `CONFIRMED` is terminal; `FAILED`
is reserved for future online-payment work. Reject/reopen reasons are trimmed,
non-empty, and at most 500 characters.

Payment initialization snapshots the active category's inspection and service
fees, vehicle expiry, Cambodia-local creation date, late days/fee, and KHR
totals. It is blocked when the classification/category/expiry sources or the
approved/scheduled prerequisites are invalid. Payment history records only
actual status transitions with status pair, actor, reason, and timestamp.

Invoices are available for `PENDING`, `REJECTED`, and `CONFIRMED` payments.
Receipts and inspection sheets are available only after confirmation. Citizens
can access documents for their own application only; admins access them by
payment. The endpoints stream PDF bytes and never expose private storage keys.

## Implemented boundaries

### Phase 6 physical inspection

After APPROVED, confirmed payment, and a scheduled daily-capacity appointment,
ADMIN records physical PASS/FAIL or manually marks an eligible past appointment
NO_SHOW. Citizens read only their own inspection status/completed history and
may view/book eligible replacement or reinspection availability; they cannot
record results or mark NO_SHOW. SYSTEM automatic NO_SHOW/expiry uses a null
actor, never a fake UUID.

Attempt 1 PASS and Attempt 2 PASS remain APPROVED and sticker eligible. Attempt
1 FAIL remains APPROVED and requires reinspection. Attempt 2 FAIL becomes
INSPECTION_FAILED. First NO_SHOW before a real FAIL remains APPROVED and permits
replacement booking; second NO_SHOW and missed first-NO_SHOW booking deadline
cancel. Missed reinspection completion deadline becomes INSPECTION_FAILED. The
maximum two actual physical attempts is an internship MVP rule, not verified
official MPWT policy.

### Phase 7 sticker issuance

A completed PASS derives the presentation state `READY_FOR_ISSUANCE`; it is not
a persisted `StickerStatus`. An ADMIN may issue a physical sticker number only
for an eligible `APPROVED` application with exactly one completed PASS on a
daily-capacity-backed appointment. Issuance creates the Sticker, sets
`completedAt`, changes the application to `COMPLETED`, and records
`STICKER_ISSUED` status history in one locked transaction. Citizens can read
only their own sticker-issuance status and cannot issue stickers.

The following are deliberately not current API behavior: generic status
updates, a fake standalone approval action, citizen slot selection for the
Phase 4 path, appointment rescheduling/cancellation, capacity release, online
payment-provider processing, certificate management, and notifications. Some
related entities or enums may exist as foundation code; they do not make an HTTP
feature implemented.
