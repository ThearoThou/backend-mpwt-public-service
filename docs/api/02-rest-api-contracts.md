# REST API contracts — first release

## 1. Scope and source of truth

This document defines the documentation-only REST contract for the first release of the MPWT Vehicle Inspection Renewal Service. It is not an implementation specification for controllers, DTO classes, authentication, storage, or database changes.

The workflow and permission source of truth is [Task 4A — users, workflow, and permissions](01-users-workflow-and-permissions.md). Data shapes and constraints are derived from `docs/database/mpwt_vehicle_inspection_full_schema.dbml`, `docs/database/mpwt_vehicle_inspection_constraints.sql`, the 16 current TypeORM entities, 18 enums, and three migrations. The existing NestJS modules establish the bounded domains only; this document does not add modules or routes in code.

No inconsistency was found between Task 4A, the approved schema, and the current entities that affects an endpoint below. When a format or limit is absent from those sources, it is explicitly left as a non-blocking implementation constant.

## 2. Approved contract decisions

- Base route is `/api/v1`. All normal bodies are UTF-8 JSON; only document submission and correction replacement use `multipart/form-data`.
- Internal path identifiers are UUIDs. `referenceNumber` is the public application identifier for citizen display and lookup.
- Authentication uses a session-bound, maximum-30-minute Bearer access token plus a fixed seven-day refresh session. Every access token contains `sub` (user ID), `role` (user role), `sid` (refresh-session ID), and `typ: 'access'`; `sid` is an identifier, not a secret. The raw refresh token exists only in an HttpOnly cookie; PostgreSQL keeps only its hash. Every refresh rotates the credential without extending the original session `expiresAt`, and an access token issued near that deadline must expire no later than `expiresAt`. There is no `GET /auth/me`; the sole current-user route is `GET /users/me`.
- Login and successful account verification each create one per-device/browser refresh session. Logout revokes only the current session and immediately blocks its bound access tokens; password-reset confirmation and disabling a user revoke all active user sessions and immediately block all access tokens bound to them; reuse of a rotated token revokes the affected session and immediately blocks its access tokens. Logging out one device/browser does not affect another active device/browser session. There is no session-management/listing route, device-management UI, or logout-all route.
- No Passport, OAuth, social login, biometric login, or external identity provider is in scope.
- Citizens authenticate with one phone or email identifier. Registration accepts phone, email, or both, but at least one is required. Successful verification activates the citizen.
- Verification codes are stored as hashes. A plaintext `developmentCode` can appear only in a local-development response; it is never persisted or returned in production-style responses.
- `CITIZEN` and `ADMIN` are the only first-release API roles. `STAFF` remains reserved without endpoints. The initial admin is a controlled bootstrap concern, never public registration.
- All three document types are mandatory on submission. Citizens see only their current document version; admins can view the full replacement history.
- Booking requires `READY_FOR_INSPECTION`, creates a `PENDING` `PAY_AT_STATION` payment when one is absent, and is capacity-safe. Rescheduling cancels the old appointment and creates a new one; it never changes `slotId` in place.
- Inspection completion, not a separate appointment endpoint, completes the appointment and sets `completedAt` in the same transaction. Reinspection is excluded.
- A rejected manual station payment is `REJECTED`, visible to the citizen, and audited. It produces neither a `PAYMENT_FAILED` timeline event nor notification. The same payment may later move from `REJECTED` to `CONFIRMED`, preserving rejection fields and both audit actions; `FAILED` is reserved for future technical/provider failure.
- `INSPECTION_FAILED`, `COMPLETED`, and `CANCELLED` applications are terminal. Historical government-service records are not deleted.
- Notifications are `IN_APP` only. Citizens never receive audit logs. Announcements broadcast one `IN_APP` `SYSTEM_ANNOUNCEMENT` notification to every active citizen.

## 3. API conventions

| Topic | Contract |
| --- | --- |
| Successful response | `{ "data": ... }`; use the listed success status. A successful empty collection is `200` with `data: []`. |
| Paginated response | `{ "data": [...], "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }`. |
| Error response | `{ "statusCode", "code", "message", "details?", "timestamp", "path" }`, with `application/json`. `details` is an array of safe field-level validation errors. |
| Properties | camelCase in the API. Database snake_case, entity internals, raw entities, raw SQL errors, stack traces, password hashes, verification-code hashes, refresh-token hashes, raw refresh tokens, refresh-cookie values, revocation data, standalone session IDs, access tokens except the approved `AuthTokenResponse`, private storage keys, and internal paths are never returned. The non-secret `sid` is intentionally contained inside signed access-token and refresh-token JWT claims, never as a separate JSON response property. |
| Dates and moments | Date-only values are `YYYY-MM-DD`; moments are ISO 8601 date-time strings with offset/UTC, sourced from PostgreSQL `timestamptz` values. |
| Authentication | Protected calls use `Authorization: Bearer <access-token>`. The future access-token guard verifies JWT signature and expiry, `typ = 'access'`, that the user still exists and is `ACTIVE`, that `sid` belongs to that user, and that the refresh session is neither revoked nor expired. Login, verification, and refresh return `AuthTokenResponse`; refresh credentials are never JSON fields. |
| Refresh cookie | Always `HttpOnly`; `Secure` is required in production; `SameSite=Lax` by default (only `lax` or `strict` are approved). Derive its path from `API_PREFIX` and limit it to the auth path where practical. Its expiry is the remaining fixed session lifetime, never a renewed seven days. |
| Not found/conflict | An unavailable resource returns a stable not-found code. Unique/state/capacity conflicts return the specific `409` code where available, otherwise `CONFLICT`. |
| Write safety | Unknown and server-managed fields are rejected. Requests do not mass assign roles, statuses, hash fields, snapshots, timestamps, foreign keys, or audit fields. |

## 4. Authentication and authorization

Public means no token. `CITIZEN` routes additionally enforce ownership. `ADMIN` routes are role restricted and may access the relevant system-wide records. The shared station/slot discovery routes and current-user route accept authenticated citizens and admins as stated in the inventory.

Invalid, missing, expired, revoked, or reused access/refresh credentials use `401 AUTH_TOKEN_INVALID` without revealing a password, code, account existence, token parsing, row, hash, expiry, revocation, or reuse detail. Refresh first validates the signed refresh credential, locks its matching session, verifies user/hash/session/fixed expiry/revocation, and requires `ACTIVE`; a disabled account uses `403 AUTH_ACCOUNT_DISABLED`. Protected access-token requests also reload/check the active user. Authorization and ownership failures use `403`; protected existence is not disclosed merely to distinguish an unowned resource from a missing one. All state-changing actions use the authenticated actor for `...ByUserId`, timeline actor, notification/audit effects where the workflow requires them.

## 5. Pagination, filtering, and sorting

All list routes in the inventory are pageable unless expressly a small application-scoped collection. `page` defaults to `1`, `limit` defaults to `20`, and `limit` must not exceed `100`. `sortOrder` is `asc` or `desc`; `sortBy` is limited to the named fields below. Invalid UUIDs, enums, sort fields/order, filters, pagination values, or ranges return `400 VALIDATION_ERROR`.

| Resource | Allowlisted filters | Allowlisted sort fields |
| --- | --- | --- |
| Applications | `status`, `citizenId` (admin), `vehicleId` (admin), `referenceNumber` (admin), `submittedFrom`, `submittedTo` | `submittedAt`, `updatedAt`, `referenceNumber`, `status` |
| Users | `role`, `status`, `phone`, `email`, `createdFrom`, `createdTo` | `createdAt`, `updatedAt`, `role`, `status` |
| Vehicles | citizen scope is implicit; admin may use `linkedCitizenId`, `registrationNumber`, `chassisNumber`, `plateNumber`, `createdFrom`, `createdTo` | `createdAt`, `registrationNumber`, `plateNumber` |
| Inspection stations | `isActive`, `province`, `search` | `nameEn`, `province`, `createdAt` |
| Appointment slots | `stationId`, `date`, `dateFrom`, `dateTo`, `status`, `hasAvailability` | `slotDate`, `startTime`, `createdAt` |
| Appointments | `applicationId`, `stationId`, `slotId`, `status`, `scheduledFrom`, `scheduledTo` | `createdAt`, `bookedAt`, `status` |
| Payments | `applicationId`, `status`, `method`, `confirmedFrom`, `confirmedTo` | `createdAt`, `confirmedAt`, `status` |
| Inspections | `applicationId`, `appointmentId`, `status`, `result`, `completedFrom`, `completedTo` | `createdAt`, `completedAt`, `result` |
| Stickers | `applicationId`, `status`, `readyFrom`, `readyTo`, `issuedFrom`, `issuedTo` | `createdAt`, `readyAt`, `issuedAt`, `status` |
| Notifications | recipient scope is implicit; `type`, `isRead`, `createdFrom`, `createdTo` | `createdAt`, `readAt` |
| Audit logs | `applicationId`, `actorUserId`, `actorType`, `entityType`, `entityId`, `action`, `createdFrom`, `createdTo` | `createdAt`, `action` |

`from` must not be later than `to`. Date-only filters use `YYYY-MM-DD`; moment filters use ISO 8601. Filtering and sorting never bypass role, disabled-user, or ownership checks, and arbitrary database-column filtering is prohibited.

## 6. Endpoint inventory

**Counts:** 77 endpoints total: 6 public, 2 refresh-cookie/session, 4 authenticated shared, 28 citizen-only, and 37 admin-only. There are 2 multipart endpoints, 27 transactional operations, 72 essential endpoints, and 5 optional convenience endpoints. A shared endpoint is counted once, not once per role.

`Tx` denotes an explicit transactional unit. `C` means citizen ownership; `A` means an administrator's system-wide access; `self` means the authenticated user only.

| Domain | Method and route | Access / ownership | Content | Request → response | Success | Tx | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | `POST /auth/register` | Public | JSON | `RegisterRequest` → `RegistrationResponse` | 201 | Yes | Essential |
| Auth | `POST /auth/verify` | Public | JSON | `VerifyAccountRequest` → `AuthTokenResponse` | 200 | Yes | Essential |
| Auth | `POST /auth/resend-verification` | Public | JSON | `ResendVerificationRequest` → `RegistrationResponse` | 202 | No | Essential |
| Auth | `POST /auth/login` | Public | JSON | `LoginRequest` → `AuthTokenResponse` + refresh cookie | 200 | Yes | Essential |
| Auth | `POST /auth/password-reset/request` | Public | JSON | `PasswordResetRequest` → `RegistrationResponse` | 202 | No | Essential |
| Auth | `POST /auth/password-reset/confirm` | Public | JSON | `PasswordResetConfirmRequest` → `RegistrationResponse` | 200 | Yes | Essential |
| Auth | `POST /auth/refresh` | Refresh cookie/session | Cookie, no JSON body | none → `AuthTokenResponse` + rotated refresh cookie | 200 | Yes | Essential |
| Auth | `POST /auth/logout` | Refresh cookie/session when available | Cookie, no JSON body | none → safe message response; clears refresh cookie | 200 | Yes | Essential |
| Users/profile | `GET /users/me` | CITIZEN or ADMIN / self | JSON | none → `CurrentUserResponse` | 200 | No | Essential |
| Users/profile | `PATCH /users/me/citizen-profile` | CITIZEN / self | JSON | `UpdateCitizenProfileRequest` → `CitizenProfileResponse` | 200 | No | Essential |
| Admin users | `GET /admin/users` | ADMIN | JSON | query → `UserSummary[]` page | 200 | No | Essential |
| Admin users | `GET /admin/users/:userId` | ADMIN | JSON | none → `UserSummary` | 200 | No | Essential |
| Admin users | `PATCH /admin/users/:userId/status` | ADMIN | JSON | `UpdateUserStatusRequest` → `UserSummary` | 200 | Yes | Essential |
| Vehicles | `GET /vehicles` | CITIZEN / C | JSON | query → `VehicleResponse[]` page | 200 | No | Essential |
| Vehicles | `POST /vehicles` | CITIZEN | JSON | `CreateVehicleRequest` → `VehicleResponse` | 201 | No | Essential |
| Vehicles | `GET /vehicles/:vehicleId` | CITIZEN / C | JSON | none → `VehicleResponse` | 200 | No | Essential |
| Admin vehicles | `GET /admin/vehicles` | ADMIN | JSON | query → `VehicleResponse[]` page | 200 | No | Essential |
| Admin vehicles | `GET /admin/vehicles/:vehicleId` | ADMIN | JSON | none → `VehicleResponse` | 200 | No | Essential |
| Applications | `POST /applications` | CITIZEN / C vehicle | Multipart | `SubmitApplicationRequest` → `ApplicationDetail` | 201 | Yes | Essential |
| Applications | `GET /applications` | CITIZEN / C | JSON | query → `ApplicationSummary[]` page | 200 | No | Essential |
| Applications | `GET /applications/:applicationId` | CITIZEN / C | JSON | none → `ApplicationDetail` | 200 | No | Essential |
| Applications | `GET /applications/by-reference/:referenceNumber` | CITIZEN / C | JSON | none → `ApplicationDetail` | 200 | No | Optional |
| Applications | `POST /applications/:applicationId/cancel` | CITIZEN / C | JSON | `CancelApplicationRequest` → `ApplicationDetail` | 200 | Yes | Essential |
| Applications | `POST /applications/:applicationId/corrections/resubmit` | CITIZEN / C | Multipart | `ResubmitApplicationCorrectionsRequest` → `ApplicationDetail` | 200 | Yes | Essential |
| Applications | `GET /applications/:applicationId/timeline` | CITIZEN / C, visible only | JSON | query → `TimelineEventResponse[]` | 200 | No | Essential |
| Admin applications | `GET /admin/applications` | ADMIN | JSON | query → `ApplicationSummary[]` page | 200 | No | Essential |
| Admin applications | `GET /admin/applications/:applicationId` | ADMIN | JSON | none → `ApplicationDetail` | 200 | No | Essential |
| Admin applications | `POST /admin/applications/:applicationId/review/start` | ADMIN | JSON | `StartApplicationReviewRequest` → `ApplicationDetail` | 200 | Yes | Essential |
| Admin applications | `POST /admin/applications/:applicationId/corrections/request` | ADMIN | JSON | `RequestApplicationCorrectionRequest` → `ApplicationDetail` | 200 | Yes | Essential |
| Admin applications | `POST /admin/applications/:applicationId/ready-for-inspection` | ADMIN | JSON | `MarkApplicationReadyRequest` → `ApplicationDetail` | 200 | Yes | Essential |
| Admin applications | `POST /admin/applications/:applicationId/cancel` | ADMIN | JSON | `AdminCancelApplicationRequest` → `ApplicationDetail` | 200 | Yes | Essential |
| Documents | `GET /applications/:applicationId/documents` | CITIZEN / C, current only | JSON | none → `ApplicationDocumentResponse[]` | 200 | No | Essential |
| Documents | `GET /applications/:applicationId/documents/:documentId` | CITIZEN / C, current only | JSON | none → `ApplicationDocumentResponse` | 200 | No | Optional |
| Documents | `GET /application-documents/:documentId/file` | CITIZEN / C, current only | binary | none → authorized file stream | 200 | No | Essential |
| Admin documents | `GET /admin/applications/:applicationId/documents` | ADMIN / all versions | JSON | none → `ApplicationDocumentResponse[]` | 200 | No | Essential |
| Admin documents | `POST /admin/application-documents/:documentId/review` | ADMIN / current document | JSON | `ReviewApplicationDocumentRequest` → `ApplicationDocumentResponse` | 200 | Yes | Essential |
| Stations/slots | `GET /inspection-stations` | CITIZEN or ADMIN | JSON | query → `InspectionStationResponse[]` page | 200 | No | Essential |
| Stations/slots | `GET /inspection-stations/:stationId` | CITIZEN or ADMIN | JSON | none → `InspectionStationResponse` | 200 | No | Essential |
| Stations/slots | `GET /appointment-slots` | CITIZEN or ADMIN | JSON | query → `AppointmentSlotResponse[]` page | 200 | No | Essential |
| Admin stations | `POST /admin/inspection-stations` | ADMIN | JSON | `CreateInspectionStationRequest` → `InspectionStationResponse` | 201 | No | Essential |
| Admin stations | `PATCH /admin/inspection-stations/:stationId` | ADMIN | JSON | `UpdateInspectionStationRequest` → `InspectionStationResponse` | 200 | No | Essential |
| Admin slots | `POST /admin/appointment-slots` | ADMIN | JSON | `CreateAppointmentSlotRequest` → `AppointmentSlotResponse` | 201 | No | Essential |
| Admin slots | `PATCH /admin/appointment-slots/:slotId` | ADMIN | JSON | `UpdateAppointmentSlotRequest` → `AppointmentSlotResponse` | 200 | No | Essential |
| Appointments | `POST /applications/:applicationId/appointments` | CITIZEN / C | JSON | `BookAppointmentRequest` → `AppointmentResponse` | 201 | Yes | Essential |
| Appointments | `GET /applications/:applicationId/appointments` | CITIZEN / C | JSON | query → `AppointmentResponse[]` | 200 | No | Essential |
| Appointments | `GET /appointments/:appointmentId` | CITIZEN / C | JSON | none → `AppointmentResponse` | 200 | No | Essential |
| Appointments | `POST /appointments/:appointmentId/cancel` | CITIZEN / C | JSON | `CancelAppointmentRequest` → `AppointmentResponse` | 200 | Yes | Essential |
| Appointments | `POST /appointments/:appointmentId/reschedule` | CITIZEN / C | JSON | `RescheduleAppointmentRequest` → `AppointmentResponse` | 200 | Yes | Essential |
| Admin appointments | `GET /admin/appointments` | ADMIN | JSON | query → `AppointmentResponse[]` page | 200 | No | Essential |
| Admin appointments | `GET /admin/appointments/:appointmentId` | ADMIN | JSON | none → `AppointmentResponse` | 200 | No | Essential |
| Admin appointments | `POST /admin/appointments/:appointmentId/cancel` | ADMIN | JSON | `AdminCancelAppointmentRequest` → `AppointmentResponse` | 200 | Yes | Essential |
| Admin appointments | `POST /admin/appointments/:appointmentId/no-show` | ADMIN | JSON | `MarkAppointmentNoShowRequest` → `AppointmentResponse` | 200 | Yes | Essential |
| Payments | `GET /applications/:applicationId/payment` | CITIZEN / C | JSON | none → `PaymentResponse` | 200 | No | Essential |
| Admin payments | `GET /admin/payments` | ADMIN | JSON | query → `PaymentResponse[]` page | 200 | No | Essential |
| Admin payments | `GET /admin/payments/:paymentId` | ADMIN | JSON | none → `PaymentResponse` | 200 | No | Essential |
| Admin payments | `POST /admin/payments/:paymentId/confirm` | ADMIN | JSON | `ConfirmPaymentRequest` → `PaymentResponse` | 200 | Yes | Essential |
| Admin payments | `POST /admin/payments/:paymentId/reject` | ADMIN | JSON | `RejectPaymentRequest` → `PaymentResponse` | 200 | Yes | Essential |
| Inspections | `GET /applications/:applicationId/inspections` | CITIZEN / C | JSON | query → `InspectionResponse[]` | 200 | No | Essential |
| Inspections | `GET /inspections/:inspectionId` | CITIZEN / C | JSON | none → `InspectionResponse` | 200 | No | Essential |
| Admin inspections | `POST /admin/appointments/:appointmentId/inspections` | ADMIN | JSON | `CreateInspectionRequest` → `InspectionResponse` | 201 | Yes | Essential |
| Admin inspections | `POST /admin/inspections/:inspectionId/complete` | ADMIN | JSON | `CompleteInspectionRequest` → `InspectionResponse` | 200 | Yes | Essential |
| Admin inspections | `GET /admin/inspections` | ADMIN | JSON | query → `InspectionResponse[]` page | 200 | No | Essential |
| Admin inspections | `GET /admin/inspections/:inspectionId` | ADMIN | JSON | none → `InspectionResponse` | 200 | No | Essential |
| Stickers | `GET /applications/:applicationId/sticker` | CITIZEN / C | JSON | none → `StickerResponse` | 200 | No | Essential |
| Stickers | `GET /stickers/:stickerId/certificate` | CITIZEN / C | binary | none → authorized certificate stream | 200 | No | Essential |
| Admin stickers | `GET /admin/stickers` | ADMIN | JSON | query → `StickerResponse[]` page | 200 | No | Essential |
| Admin stickers | `GET /admin/stickers/:stickerId` | ADMIN | JSON | none → `StickerResponse` | 200 | No | Essential |
| Admin stickers | `POST /admin/stickers/:stickerId/ready-for-pickup` | ADMIN | JSON | `MarkStickerReadyRequest` → `StickerResponse` | 200 | Yes | Essential |
| Admin stickers | `POST /admin/stickers/:stickerId/issue` | ADMIN | JSON | `IssueStickerRequest` → `StickerResponse` | 200 | Yes | Essential |
| Notifications | `GET /notifications` | CITIZEN / C | JSON | query → `NotificationResponse[]` page | 200 | No | Essential |
| Notifications | `GET /notifications/:notificationId` | CITIZEN / C | JSON | none → `NotificationResponse` | 200 | No | Optional |
| Notifications | `PATCH /notifications/:notificationId/read` | CITIZEN / C | JSON | none → `NotificationResponse` | 200 | No | Essential |
| Notifications | `POST /notifications/read-all` | CITIZEN / C | JSON | none → `{ updatedCount: integer }` | 200 | No | Essential |
| Admin notifications | `POST /admin/notifications/announcements` | ADMIN | JSON | `CreateSystemAnnouncementRequest` → `{ recipientCount: integer }` | 201 | Yes | Essential |
| Audit logs | `GET /admin/audit-logs` | ADMIN | JSON | query → `AuditLogResponse[]` page | 200 | No | Essential |
| Audit logs | `GET /admin/audit-logs/:auditLogId` | ADMIN | JSON | none → `AuditLogResponse` | 200 | No | Optional |
| Dashboard | `GET /admin/dashboard/summary` | ADMIN | JSON | none → `AdminDashboardSummaryResponse` | 200 | No | Optional |

There are no generic status PATCH routes, deletion routes, registry routes, direct storage routes, appointment-completion route, or reinspection route.

## 7. Authentication contracts

| Endpoint | Request and validation | Response / errors | Security and rate limit |
| --- | --- | --- | --- |
| Register | `RegisterRequest`: password plus phone and/or email, citizen profile fields, and `verificationIdentifier` when both identifiers are supplied. Require one normalized identifier; reject duplicate identifiers and any role/status input. | `201 RegistrationResponse`; `USER_IDENTIFIER_CONFLICT`, `VALIDATION_ERROR`. | Rate limit by client/IP and normalized identifier. Creates a pending citizen and hashed registration code; no public admin creation. |
| Verify | `VerifyAccountRequest`: destination/identifier and code. The endpoint selects `REGISTER_ACCOUNT` internally. | `200 AuthTokenResponse` plus refresh cookie; invalid/expired/exhausted-code errors. Successful code activation creates one refresh session and access token. | Rate limit; compare only hashes. `developmentCode` is never accepted as an authorization bypass. |
| Resend verification | `ResendVerificationRequest`: identifier. The endpoint selects `REGISTER_ACCOUNT` internally. | `202 RegistrationResponse`, uniformly safe where practical. | Rate limit. Creates/replaces only permitted verification-code state; delivery is not implemented. |
| Login | `LoginRequest`: a single `identifier` and password. | `200 AuthTokenResponse` plus refresh cookie; `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_NOT_ACTIVE`, or `AUTH_ACCOUNT_DISABLED`. | Rate limit; accept normalized phone or email. Matched account must be ACTIVE. Login and session creation are transactional. |
| Password reset request | `PasswordResetRequest`: identifier. | Always `202 RegistrationResponse` with a generic message. | Rate limit and prevent account enumeration. No plaintext code outside local development behavior. |
| Password reset confirm | `PasswordResetConfirmRequest`: identifier, code, new password. The endpoint selects `RESET_PASSWORD` internally. | `200 RegistrationResponse`; code errors or `VALIDATION_ERROR`. | Rate limit; code is hash checked and marked used atomically with password hash replacement and all active user-session revocations. No replacement session is created. |
| Refresh | No JSON request body; authenticate only with the refresh cookie. | `200 AuthTokenResponse` and rotated refresh cookie; invalid/missing/expired/revoked/reused credentials return `401 AUTH_TOKEN_INVALID`; disabled account returns `AUTH_ACCOUNT_DISABLED`. | Transactionally lock and validate the signed session ID, user, hidden hash, fixed expiry, and revocation state; rotate the same row and update usage without extending `expiresAt`. Do not disclose which validation failed. |
| Logout | No JSON request body; uses the refresh cookie when available. | `200` safe message response and cleared refresh cookie. | Transactionally revoke only the matching current session when valid. Always clear the cookie and remain idempotent without disclosing whether it was missing, expired, revoked, invalid, or reused. |

`RegistrationResponse` does not disclose a password, hash, or code. In local development only, a separately documented `DevelopmentVerificationResponse` may be included as `data.development` to aid local testing; it contains an ephemeral `developmentCode` and may expose its approved `VerificationPurpose` value. It must be omitted outside local development. `AuthTokenResponse` contains only the approved access-token response fields. The non-secret `sid` is intentionally inside the signed access-token JWT (and inside the signed refresh-token JWT); it is never a separate JSON response property. Raw refresh tokens, refresh-cookie values, token hashes, revocation data, and standalone session IDs are never returned in JSON.

## 8. User and profile contracts

`GET /users/me` returns the caller's safe summary, role, status, verification moments, and a citizen-profile summary only for `CITIZEN`. Phone/email changes are excluded from this first release (`CHANGE_PHONE` remains a reserved verification purpose, not an endpoint); role, status, password hash, verification stamps, timestamps, and identifiers are server-managed. The citizen-profile route below is the only self-service profile write.

`PATCH /users/me/citizen-profile` requires `CITIZEN` and is the sole first-release self-service profile write. It permits only approved citizen-profile fields, never identity state, role, status, password, or verification state. `GET /users/me` is the sole current-profile read. There is no account deletion.

Admin user listing/detail returns safe `UserSummary` values only. It supports the user filters in section 5. `PATCH /admin/users/:userId/status` accepts exactly `ACTIVE` or `DISABLED`; it rejects `PENDING_VERIFICATION`, arbitrary roles, passwords, and verification-code access. The update records an audit effect and returns `USER_STATUS_INVALID_TRANSITION` when the requested state is not permitted.

## 9. Vehicle contracts

`POST /vehicles` accepts `CreateVehicleRequest` only. Citizens list and retrieve only vehicles in their permitted `linkedCitizenId` scope; administrators use the two explicit admin read routes to see all local/mock records. `VehicleResponse` uses safe vehicle fields and optional linked citizen summary only where the caller is authorized.

Registration number, chassis number, and the approved plate uniqueness combination are validated against their database constraints and produce `VEHICLE_REGISTRATION_CONFLICT`, `VEHICLE_CHASSIS_CONFLICT`, or `VEHICLE_PLATE_CONFLICT`. There is no external MPWT registry lookup, no delete route, and no general citizen or administrator vehicle PATCH route. Application snapshots stay immutable after submission; the exact vehicle-editing policy afterward is deferred.

## 10. Application contracts

`POST /applications` is multipart and atomically accepts `vehicleId`, `vehicleRegistrationCard`, `previousInspectionCertificate`, and `nationalId`. All three files are required. It creates the application, generated public reference number, applicant and vehicle snapshots, one initial row for each document type, a submitted timeline event, an in-app notification, and audit record. The citizen must own or be permitted to use the selected vehicle. The `uq_active_application_per_vehicle` partial unique index protects one active application per vehicle; a collision returns `APPLICATION_ACTIVE_EXISTS` and rolls back every creation.

Citizen application list, id/detail, and public-reference lookup enforce ownership. Timeline returns only citizen-visible events. There is no generic status update, deletion, reopening, or reinspection endpoint.

Citizen cancellation requires ownership, status `SUBMITTED`, `CORRECTION_REQUIRED`, or `READY_FOR_INSPECTION`, no confirmed payment, and no completed inspection. It requires `cancellationReason`. In the same transaction, if a `SCHEDULED` appointment exists, set it `CANCELLED`, record `cancelledAt`, `cancelledByUserId`, and `cancellationReason`, release its scheduled-capacity usage, then create `APPOINTMENT_CANCELLED` timeline, notification, and audit records. Next cancel the application with its cancellation fields and create `APPLICATION_CANCELLED` timeline, notification, and audit records. If no scheduled appointment exists, create only the application cancellation effects. Any failure rolls back every effect. Otherwise return `APPLICATION_CANNOT_CANCEL` or `APPLICATION_INVALID_TRANSITION`.

Correction resubmission is multipart, valid only from `CORRECTION_REQUIRED`, and accepts only replacement files relevant to the request. It locks the affected application/documents, inserts higher document versions, marks previous current versions false, preserves history, and relies on `uq_current_document_per_type`. It changes the workflow back to `SUBMITTED` with a `CORRECTION_RESUBMITTED` timeline event and audit record in one transaction. It creates no notification because no approved notification type exists for correction resubmission.

| Admin transition | Current → target | Request / mandatory precondition and effects |
| --- | --- | --- |
| `review/start` | `SUBMITTED` → `UNDER_REVIEW` | `StartApplicationReviewRequest` has no client status. An admin becomes the reviewer; record review fields, timeline, notification, audit, and response in one transaction. |
| `corrections/request` | `UNDER_REVIEW` → `CORRECTION_REQUIRED` | `RequestApplicationCorrectionRequest` requires correction instructions. Record reviewer/action details, timeline, citizen notification, and audit transactionally. |
| `ready-for-inspection` | `UNDER_REVIEW` → `READY_FOR_INSPECTION` | `MarkApplicationReadyRequest` has no arbitrary status. All required current documents must be approved (`DOCUMENTS_NOT_APPROVED` otherwise); record timeline, notification, audit. |
| `cancel` | any non-final permitted state → `CANCELLED` | `AdminCancelApplicationRequest` requires reason and is prohibited after completed inspection. Preserve history. If a scheduled appointment exists, cancel it and record its `APPOINTMENT_CANCELLED` timeline, notification, and audit effects before application cancellation; then record application cancellation fields, `APPLICATION_CANCELLED` timeline, notification, and audit in the same transaction. A confirmed payment remains unchanged as immutable history: no reversal, deletion, refund, refund endpoint, reversal endpoint, refund table, or new payment status is involved. |

Each transition rejects an inappropriate source/terminal state with `APPLICATION_INVALID_TRANSITION` and rolls back all listed effects on failure. Admin lists use the exact application filters from section 5.

## 11. Document contracts

Citizen list/detail/download routes require owned application/document access and return only the current version of each type. The file route authorizes first, then streams/downloads a safe file representation without a storage path or private key. Admin document listing may return all versions and replacement history.

`POST /admin/application-documents/:documentId/review` accepts `ReviewApplicationDocumentRequest` for a current document only. Its `status` is exactly `APPROVED` or `REJECTED`; `rejectionReason` is required for `REJECTED` and rejected otherwise. It records the reviewer/moment and required audit effect as one transaction. Review does not itself arbitrarily change application status. Documents are replaced only by the citizen correction-resubmission route. There is no delete, in-place replacement, generic document status PATCH, or direct storage-key route.

## 12. Station and slot contracts

`GET /inspection-stations`, `GET /inspection-stations/:stationId`, and `GET /appointment-slots` require an authenticated `CITIZEN` or `ADMIN`; none is anonymous. Citizen-facing slot discovery normally limits results to eligible `OPEN` slots with availability. The station and slot filters are those in section 5.

Administrators use the explicit station and slot creation/update routes. A capacity must be positive and `endTime` must be later than `startTime`; a slot update cannot reduce capacity below the count of `SCHEDULED` appointments (`SLOT_CAPACITY_BELOW_BOOKINGS`). `CLOSED` and `CANCELLED` slots cannot accept bookings. There are no duplicate admin station read routes and no hard-delete endpoints.

## 13. Appointment contracts

Booking requires the citizen's application to be `READY_FOR_INSPECTION`, an `OPEN` slot, remaining capacity, and no other scheduled appointment. In one transaction, it locks/protects the slot, counts scheduled bookings, relies on `uq_scheduled_appointment_per_application`, inserts the appointment, creates a `PENDING` `PAY_AT_STATION` payment if absent, and creates its required timeline, notification, and audit records. Capacity or state races return `SLOT_CAPACITY_EXCEEDED`, `SLOT_NOT_OPEN`, or `APPOINTMENT_ALREADY_SCHEDULED` and roll back all effects.

Citizens can list/detail only their application appointments. They may cancel only their own `SCHEDULED` appointment before the start time, with a reason and actor/time fields. Administrators can list/detail all appointments, cancel only a scheduled appointment with an operational reason, or mark an eligible scheduled appointment `NO_SHOW`; no-show creates its required timeline/notification/audit effects and no inspection.

Rescheduling validates the same booking conditions, cancels the old appointment, creates a new appointment in the requested slot, and produces the relevant records in one transaction. It never updates `slotId` in place and preserves the old appointment. There is deliberately no `POST /admin/appointments/:appointmentId/complete`; inspection completion performs appointment completion.

## 14. Payment contracts

The citizen payment route returns only the caller's application's `PaymentResponse`, including a visible `REJECTED` state if applicable. Admin payments use the listed filters and explicit detail route.

`confirm` accepts `ConfirmPaymentRequest`, requires a `PENDING` or `REJECTED` `PAY_AT_STATION` payment and unique `receiptNumber`, changes its status to `CONFIRMED`, and records `confirmedAt`, `confirmedByUserId`, and the receipt. Existing `rejectedAt`, `rejectedByUserId`, and `rejectionReason` remain stored. It creates `PAYMENT_CONFIRMED` timeline, notification, and audit records atomically. `reject` accepts `RejectPaymentRequest` only for a `PENDING` `PAY_AT_STATION` payment, stores rejected actor/reason/state, and writes an audit record only. A rejected station payment creates **no** `PAYMENT_FAILED` timeline or notification and no new enum value; it may later be confirmed. It does not terminally block the application, which remains `READY_FOR_INSPECTION` until confirmation and inspection proceed. A confirmed payment cannot be confirmed or rejected again. If an admin later cancels the application, the confirmed payment remains unchanged as immutable history; it is not reversed, deleted, or automatically refunded. A rejected payment cannot be rejected again; all other state attempts return `PAYMENT_INVALID_TRANSITION`.

## 15. Inspection contracts

Citizen inspection list/detail routes enforce application ownership. Admin creation at an appointment creates one `PENDING` inspection only after verifying appointment/application consistency through the approved composite relationship, application `READY_FOR_INSPECTION`, confirmed payment, and absence of an existing inspection. It relies on the one-inspection-per-appointment uniqueness and returns `INSPECTION_ALREADY_EXISTS` or `PAYMENT_NOT_CONFIRMED` as appropriate.

Completion accepts only a `PENDING` inspection. `CompleteInspectionRequest.result` is `PASS` or `FAIL`; `failureReason` is required for `FAIL`. In a single transaction it records completion and actor, completes the related appointment, sets `appointment.completedAt`, writes required timeline/notification/audit effects, and resolves the application outcome.

For `PASS`, retain/create one `NOT_READY` sticker, emit `INSPECTION_PASSED` timeline/notification, and later emit `STICKER_PREPARING` when preparation begins; the application is not completed yet. For `FAIL`, transition the application to terminal `INSPECTION_FAILED`, emit its timeline/notification and audit effect, and create no sticker. No inspection deletion, manual appointment completion, or reinspection route exists.

## 16. Sticker contracts

Citizens can view the sticker for their own application and download an authorized certificate without storage-key disclosure. Admins list/detail all stickers using section 5 filters.

`ready-for-pickup` is valid only for a correctly prepared eligible sticker; it records ready moment/actor, changes state to `READY_FOR_PICKUP`, and emits `STICKER_READY` timeline, notification, and audit effects. `issue` requires a completed PASS inspection and approved pickup/recipient information, records recipient, `issuedAt`, and issuer, marks the sticker issued, then atomically completes the application. It emits `STICKER_ISSUED` plus `APPLICATION_COMPLETED` timeline/notification effects. Violations use `STICKER_INVALID_TRANSITION` or `STICKER_PASS_INSPECTION_REQUIRED`. There is no delete route.

## 17. Notification contracts

Citizens list, detail, mark-read, and mark-all-read only their own notifications. Marking read is idempotent and returns the safe notification representation; citizens cannot create/delete notifications. Operational notifications are system generated and `IN_APP` only.

`POST /admin/notifications/announcements` accepts `CreateSystemAnnouncementRequest` and, transactionally, creates one `channel=IN_APP`, `type=SYSTEM_ANNOUNCEMENT` record for every `ACTIVE` citizen. It returns the recipient count, creates an audit record, and rolls all recipient inserts back on failure. It supports no targeted audience, custom audience query, scheduling, email, SMS, or deletion.

## 18. Audit-log contracts

Both audit routes are ADMIN-only. Logs are immutable, system-generated records; there is no create or delete route. List filters are allowlisted in section 5. `AuditLogResponse` redacts sensitive old/new values and never contains passwords, password hashes, verification/development codes, access tokens, or citizen-inaccessible details.

## 19. Optional admin dashboard contract

`GET /admin/dashboard/summary` is ADMIN-only, read-only, and lower priority than the workflow routes. `AdminDashboardSummaryResponse` may count `SUBMITTED`, `UNDER_REVIEW`, `CORRECTION_REQUIRED`, and `READY_FOR_INSPECTION` applications, today's scheduled appointments, pending payments, and stickers ready for pickup. It is calculated from existing tables; it does not add schema or broad analytics.

## 20. Shared response models

All models are contract models, not direct TypeORM entities. `R` denotes required/non-null and `N` denotes nullable/optional in the response. Sources identify the approved entity/table family; visibility restrictions apply in addition to route authorization.

| Model | Fields (API type; R/N; source; visibility) |
| --- | --- |
| `AuthTokenResponse` | `accessToken` string R (session-bound JWT with a maximum 30-minute lifetime; caller only), `tokenType` literal `Bearer` R, `expiresIn` integer R (actual remaining access-token seconds, at most `1800`; caller only), `user` `UserSummary` R. The HTTP response also sets a refresh cookie where the authentication contract says so; no cookie value, raw refresh token, token hash, revocation data, or standalone session ID is a model field. |
| `RegistrationResponse` | `message` string R (workflow), `verificationRequired` boolean R (workflow), `destinationHint` string N (masked identifier; caller only), `development` `DevelopmentVerificationResponse` N (local development only). |
| `DevelopmentVerificationResponse` | `developmentCode` string R (ephemeral verification output; local development only), `purpose` `VerificationPurpose` R. Never stored in or returned from production-style responses. |
| `UserSummary` | `id` UUID R, `phone` string N, `email` string N, `role` `UserRole` R, `status` `UserStatus` R, `phoneVerifiedAt` date-time N, `emailVerifiedAt` date-time N, `createdAt`/`updatedAt` date-time R (users). Own/admin only; no hashes or code records. |
| `CurrentUserResponse` | `user` `UserSummary` R (users), `citizenProfile` `CitizenProfileResponse` N (citizen_profiles; caller only). |
| `CitizenProfileResponse` | `id` UUID R, `userId` UUID R, `nameKh` string R, `nameEn` string R, `nationalIdNumber` string N, `address` string N, `profileImageUrl` string N derived from `profileImageKey`, `createdAt`/`updatedAt` date-time R (citizen_profiles). Self/admin only. The raw private `profileImageKey` is never returned; `phone` and `email` belong to `UserSummary`. |
| `VehicleResponse` | `id` UUID R, `linkedCitizenId` UUID N, registration/chassis/plate and approved descriptive fields R/N as sourced from vehicles, `createdAt`/`updatedAt` R. Owner or admin only. |
| `ApplicationSummary` | `id` UUID R, `referenceNumber` string R, `status` `ApplicationStatus` R, `citizenId`/`vehicleId` UUID R, `submittedAt`/`updatedAt` date-time R (renewal_applications). Citizen owner or admin. |
| `ApplicationDetail` | `ApplicationSummary` fields plus approved applicant/vehicle snapshots, review/correction/cancellation fields N, `cancelledAt` N, and permitted related summaries (renewal_applications). Citizen owner/admin; internal audit fields excluded. |
| `ApplicationDocumentResponse` | `id`, `applicationId` UUID R, `documentType` `DocumentType` R, `versionNumber` integer R, `isCurrent` boolean R, `originalFileName`/`mimeType`/`fileSizeBytes` display metadata R, `status` `DocumentStatus` R, reviewer/moment/reason N (application_documents). Citizen sees current only; admin sees history; no storage key/path. |
| `InspectionStationResponse` | `id` UUID R, `code`, `nameKh`, `nameEn`, `province`, `address` strings R, `phone` string N, `isActive` boolean R, timestamps R (inspection_stations). Authenticated roles; admin management fields only as approved. |
| `AppointmentSlotResponse` | `id`, `stationId` UUID R, `slotDate` date R, `startTime`/`endTime` time strings R, `capacity` integer R, `status` `AppointmentSlotStatus` R, `scheduledCount`/`availableCapacity` integer N derived, timestamps R (appointment_slots). Authenticated roles. |
| `AppointmentResponse` | `id`, `applicationId`, `slotId` UUID R, `status` `AppointmentStatus` R, scheduled/cancelled/completed moments N, reasons N, station/slot summaries N (appointments). Owner/admin only. |
| `PaymentResponse` | `id`, `applicationId` UUID R, invoice/receipt identifiers N, `method` `PaymentMethod` R, `status` `PaymentStatus` R, monetary amounts as decimal strings R, provider display fields N, `confirmedAt`/`confirmedByUserId` N, `rejectedAt`/`rejectedByUserId`/`rejectionReason` N (payments). Rejection history remains visible when a later confirmation occurs. Owner/admin only; no provider secret data. |
| `InspectionResponse` | `id`, `applicationId`, `appointmentId` UUID R, `status` `InspectionStatus` R, `result` `InspectionResult` N, findings/failure reason N, completed/recorded fields N (inspections). Owner/admin only. |
| `StickerResponse` | `id`, `applicationId` UUID R, `status` `StickerStatus` R, sticker/certificate display numbers N, ready/issued moments and permitted pickup data N (stickers). Owner/admin; no private certificate storage key. |
| `NotificationResponse` | `id`, `type` `NotificationType`, `channel` `NotificationChannel`, title/body R, `isRead` boolean R, `readAt` N, `createdAt` R, permitted related application id N (notifications). Recipient/admin only; never another citizen's recipient details. |
| `TimelineEventResponse` | `id`, `applicationId` UUID R, `eventType` `TimelineEventType` R, safe message/payload N, `occurredAt` R, actor safe summary N (application_timeline_events). Citizen-visible events only for citizens; admin all permitted events. |
| `AuditLogResponse` | `id`, actor safe summary N, `actorType`, `entityType`, `entityId`, `applicationId`, `action`, `createdAt` R, redacted `oldValues`/`newValues` N (audit_logs). ADMIN only. |
| `AdminDashboardSummaryResponse` | seven integer counters R: `submittedApplications`, `underReviewApplications`, `correctionRequiredApplications`, `readyForInspectionApplications`, `todayScheduledAppointments`, `pendingPayments`, `readyForPickupStickers` (derived existing tables). ADMIN only. |
| `PaginationMeta` | `page`, `limit`, `total`, `totalPages` integer R (query result; list responses). |
| `ValidationErrorDetail` | `field` string R, `message` string R, `rule` string N (validation layer). Safe client validation only. |
| `ApiErrorResponse` | `statusCode` integer R, `code` string R, `message` string R, `details` `ValidationErrorDetail[]` N, `timestamp` date-time R, `path` string R (API error layer). No stack/raw database detail. |

`UserRole`, `UserStatus`, `VerificationPurpose`, `ApplicationStatus`, `DocumentType`, `DocumentStatus`, `AppointmentSlotStatus`, `AppointmentStatus`, `PaymentMethod`, `PaymentStatus`, `InspectionStatus`, `InspectionResult`, `StickerStatus`, `NotificationType`, `NotificationChannel`, and `TimelineEventType` mean exactly their existing PostgreSQL/TypeScript enum values; this contract introduces no enum member. `InspectionStation.isActive` is a boolean, not an invented station-status enum.

## 21. Request DTO definitions

All DTOs reject unspecified, entity-only, role/status (unless explicitly permitted), timestamps, hash, storage, snapshot, foreign-key ownership, and audit fields. `R` / `O` means required / optional. “Constant” means an implementation-level constant to finalize before coding.

| DTO | Fields, validation, normalization, and conditionals |
| --- | --- |
| `RegisterRequest` | `phone` string O normalized phone; `email` string O lowercase/trimmed; at least one R; `verificationIdentifier` string conditionally R when both phone and email are supplied, and then must equal one supplied normalized identifier; `password` string R; `nameKh` and `nameEn` strings R; `nationalIdNumber` and `address` strings O. The selected destination receives the internally chosen `REGISTER_ACCOUNT` code. Reject role/status/admin flags, profile storage keys, and verification/hash fields. |
| `VerifyAccountRequest` | `identifier` string R normalized and `code` string R. Reject `purpose`; the endpoint selects `REGISTER_ACCOUNT`. |
| `ResendVerificationRequest` | `identifier` string R normalized. Reject `purpose`; the endpoint selects `REGISTER_ACCOUNT`. |
| `LoginRequest` | `identifier` string R (normalized phone or email) and `password` string R. |
| `PasswordResetRequest` | `identifier` string R normalized; generic response regardless of account existence. |
| `PasswordResetConfirmRequest` | `identifier`, `code`, `newPassword` strings R. Reject `purpose`; the endpoint selects `RESET_PASSWORD`. |
| Refresh/logout | No request DTO: both routes have no JSON body and use only the refresh cookie when present. |
| `UpdateCitizenProfileRequest` | `nameKh`, `nameEn`, `nationalIdNumber`, and `address` strings O, normalized/trimmed as appropriate. Reject `userId`, `profileImageKey`, phone/email, identity status, role, audit/timestamps. Profile-image upload is not a first-release route. |
| `UpdateUserStatusRequest` | `status` enum R, exactly `ACTIVE` or `DISABLED`; reject role and all authentication fields. |
| `CreateVehicleRequest` | Registration, chassis, plate, and approved local/mock vehicle descriptive fields R/O as schema requires; trim/canonicalize identifiers. Reject client `linkedCitizenId`; the citizen-ownership rule sets it server-side. |
| `SubmitApplicationRequest` | Multipart: `vehicleId` UUID R; files `vehicleRegistrationCard`, `previousInspectionCertificate`, `nationalId` R. Optional approved file metadata only. Reject application status, reference, snapshot, document version/review, foreign owner fields. |
| `CancelApplicationRequest` | `cancellationReason` trimmed nonblank string R (max Constant). |
| `ResubmitApplicationCorrectionsRequest` | Multipart replacement files keyed by the three approved document field names O; at least one file relevant to the outstanding correction R. No direct document status/version/current fields. |
| `StartApplicationReviewRequest` | Empty object only; reject status/reviewer assignment/client audit fields. |
| `RequestApplicationCorrectionRequest` | `correctionReason` trimmed nonblank string R (max Constant); optional safe document-type references restricted to approved types. |
| `MarkApplicationReadyRequest` | Empty object only; server verifies approved current documents. |
| `AdminCancelApplicationRequest` | `cancellationReason` trimmed nonblank string R (max Constant). |
| `ReviewApplicationDocumentRequest` | `status` enum R, `APPROVED` or `REJECTED`; `rejectionReason` R iff rejected, prohibited/ignored never silently accepted for approved. |
| `CreateInspectionStationRequest` | `code`, `nameKh`, `nameEn`, `province`, `address` strings R; `phone` and `isActive` O by schema; trim strings. Reject identifiers/timestamps/audit. |
| `UpdateInspectionStationRequest` | Approved mutable station fields O only; reject id/timestamps/audit. |
| `CreateAppointmentSlotRequest` | `stationId` UUID R, `slotDate` date R, `startTime`/`endTime` time R, `capacity` positive integer R, permitted status O. End must be later than start. |
| `UpdateAppointmentSlotRequest` | Mutable date/time/capacity/status fields O; positive capacity and valid time range; reject capacity below scheduled bookings. |
| `BookAppointmentRequest` | `slotId` UUID R only. Reject application id/status/payment/actor fields. |
| `CancelAppointmentRequest` | `cancellationReason` trimmed nonblank string R (max Constant). |
| `RescheduleAppointmentRequest` | `slotId` UUID R and `cancellationReason` R; server cancels/recreates instead of accepting appointment status or in-place slot update. |
| `AdminCancelAppointmentRequest` | `cancellationReason`/operational reason trimmed nonblank string R (max Constant). |
| `MarkAppointmentNoShowRequest` | `reason` string O (max Constant); server controls no-show state/actor/time. |
| `ConfirmPaymentRequest` | `receiptNumber` trimmed string R. Reject amount, method, status, provider, confirmation actor/time assignment. |
| `RejectPaymentRequest` | `rejectionReason` trimmed nonblank string R (max Constant). |
| `CreateInspectionRequest` | Optional safe inspection observations/metadata O; reject appointment/application/status/actor/completion/result fields. |
| `CompleteInspectionRequest` | `result` enum R, `PASS` or `FAIL`; `failureReason` R iff `FAIL`, prohibited/omitted for `PASS`; approved findings O. |
| `MarkStickerReadyRequest` | Approved preparation/sticker-number fields required by implementation workflow; reject status, ready actor/moment, application changes. Exact field formats are Constants. |
| `IssueStickerRequest` | Approved recipient/pickup fields R and optional certificate metadata only; reject issued actor/moment/status/application fields. |
| `CreateSystemAnnouncementRequest` | `title` and `body` trimmed nonblank strings R (max Constants). Reject channel/type/audience/schedule fields; server sets `IN_APP`, `SYSTEM_ANNOUNCEMENT`, and all active-citizen recipients. |

## 22. Validation rules

| Subject | Rule |
| --- | --- |
| Paths | Every `:...Id` is UUID. Malformed UUIDs return `VALIDATION_ERROR`. `referenceNumber` is validated against its eventual approved public format; no format is invented here. |
| Phone/email | Phone is normalized according to the chosen implementation policy; email is trimmed/lowercased and syntactically valid. At least one is required at registration. |
| Password/code | Password meets a minimum policy and verification code meets format/length rules, both implementation-level Constants. Code attempts/expiry follow the approved verification-code fields. |
| Enums | Accept only existing enum values and the endpoint-specific subsets stated above. |
| Pagination/sorting | Positive integer page/limit; maximum 100; only section 5 filters/sort fields/order. |
| Date/time | Date-only `YYYY-MM-DD`, timestamps ISO 8601, `from <= to`, and end time later than start time. |
| Text/reasons | Trim and reject blank input. Exact maximum lengths for free text, cancellation, correction, rejection, failure, and announcement content are Constants. |
| Money | Use decimal-string transport values, nonnegative values, approved scale/precision, and never floating-point arithmetic. Database payment checks remain authoritative. |
| Files | Permit only the three named submission fields and correction replacements relevant to the correction. MIME allowlist, max size, filename policy, malware scanning, and storage provider are Constants. File metadata is validated and client storage keys/paths are rejected. |
| Receipt/sticker/certificate | Required conditionally as stated; exact formats are Constants. Uniqueness conflicts use their specific codes. |
| Slot capacity | Positive integer; update cannot be less than current scheduled bookings. |
| Conditional requirements | Document rejection needs `rejectionReason`; inspection `FAIL` needs `failureReason`; payment rejection needs `rejectionReason`; confirmation needs `receiptNumber`; application/appointment cancellation needs reason; sticker issue needs approved recipient/pickup fields. |

## 23. Error-code catalog

The approved list contains **55 named codes** (not 56: the supplied categories total 55). No unapproved fifty-sixth code is invented. Details are safe to citizens only when they identify a client field or allowed state without disclosing another account/resource; all errors are logged internally with sanitized context, except expected rate-limit noise may be aggregated.

| Category | Code | HTTP | Returned when |
| --- | --- | --- | --- |
| Authentication | `AUTH_INVALID_CREDENTIALS` | 401 | Login credentials are invalid. |
| Authentication | `AUTH_ACCOUNT_NOT_ACTIVE` | 403 | Account exists but is not active. |
| Authentication | `AUTH_ACCOUNT_DISABLED` | 403 | A disabled account attempts authentication or protected use. |
| Authentication | `AUTH_TOKEN_INVALID` | 401 | An access or refresh credential is missing, invalid, expired, revoked, or reused. The response never identifies which case occurred. |
| Authentication | `AUTH_VERIFICATION_CODE_INVALID` | 400 | Code/purpose/destination does not validate. |
| Authentication | `AUTH_VERIFICATION_CODE_EXPIRED` | 400 | Code expired. |
| Authentication | `AUTH_VERIFICATION_ATTEMPTS_EXCEEDED` | 429 | Code attempt allowance exceeded. |
| Authorization | `FORBIDDEN` | 403 | Role/action is prohibited. |
| Authorization | `RESOURCE_NOT_OWNED` | 403 | Resource is outside citizen ownership scope. |
| Users | `USER_NOT_FOUND` | 404 | Admin-requested user is absent. |
| Users | `USER_STATUS_INVALID_TRANSITION` | 409 | Requested admin status change is disallowed. |
| Users | `USER_IDENTIFIER_CONFLICT` | 409 | Phone/email is already used. |
| Vehicles | `VEHICLE_NOT_FOUND` | 404 | Permitted vehicle is absent. |
| Vehicles | `VEHICLE_REGISTRATION_CONFLICT` | 409 | Registration uniqueness conflicts. |
| Vehicles | `VEHICLE_CHASSIS_CONFLICT` | 409 | Chassis uniqueness conflicts. |
| Vehicles | `VEHICLE_PLATE_CONFLICT` | 409 | Plate uniqueness conflicts. |
| Applications | `APPLICATION_NOT_FOUND` | 404 | Permitted application/reference is absent. |
| Applications | `APPLICATION_ACTIVE_EXISTS` | 409 | Active application already exists for vehicle. |
| Applications | `APPLICATION_INVALID_TRANSITION` | 409 | Source/target status is invalid. |
| Applications | `APPLICATION_CANNOT_CANCEL` | 409 | Citizen/admin cancellation preconditions fail. |
| Applications | `REQUIRED_DOCUMENTS_MISSING` | 400 | Submission/transition lacks required current documents. |
| Applications | `DOCUMENTS_NOT_APPROVED` | 409 | Ready transition lacks approved current documents. |
| Documents | `DOCUMENT_NOT_FOUND` | 404 | Permitted document is absent. |
| Documents | `DOCUMENT_REJECTION_REASON_REQUIRED` | 400 | Rejected review lacks reason. |
| Documents | `DOCUMENT_INVALID_REPLACEMENT` | 409 | Replacement is not relevant/allowed/current workflow. |
| Documents | `DOCUMENT_FILE_INVALID` | 400 | File metadata/content policy fails. |
| Appointments/slots | `STATION_NOT_FOUND` | 404 | Station is absent. |
| Appointments/slots | `SLOT_NOT_FOUND` | 404 | Slot is absent. |
| Appointments/slots | `SLOT_NOT_OPEN` | 409 | Slot is closed/cancelled/non-open. |
| Appointments/slots | `SLOT_CAPACITY_EXCEEDED` | 409 | No capacity remains. |
| Appointments/slots | `SLOT_CAPACITY_BELOW_BOOKINGS` | 409 | Requested capacity is below scheduled bookings. |
| Appointments/slots | `APPOINTMENT_NOT_FOUND` | 404 | Permitted appointment is absent. |
| Appointments/slots | `APPOINTMENT_ALREADY_SCHEDULED` | 409 | Application already has scheduled appointment. |
| Appointments/slots | `APPOINTMENT_INVALID_TRANSITION` | 409 | Appointment state/action is invalid. |
| Appointments/slots | `APPOINTMENT_CANNOT_CANCEL` | 409 | Cancellation preconditions fail. |
| Appointments/slots | `APPOINTMENT_ALREADY_STARTED` | 409 | Citizen tries to cancel/reschedule at/after start. |
| Payments | `PAYMENT_NOT_FOUND` | 404 | Permitted payment is absent. |
| Payments | `PAYMENT_NOT_CONFIRMED` | 409 | Inspection needs confirmed payment. |
| Payments | `PAYMENT_INVALID_TRANSITION` | 409 | Payment is not eligible for confirm/reject. |
| Payments | `PAYMENT_RECEIPT_NUMBER_CONFLICT` | 409 | Receipt uniqueness conflicts. |
| Payments | `PAYMENT_REJECTION_REASON_REQUIRED` | 400 | Rejected payment lacks reason. |
| Inspections | `INSPECTION_NOT_FOUND` | 404 | Permitted inspection is absent. |
| Inspections | `INSPECTION_ALREADY_EXISTS` | 409 | Appointment already has inspection. |
| Inspections | `INSPECTION_INVALID_TRANSITION` | 409 | Inspection is not pending/eligible. |
| Inspections | `INSPECTION_FAILURE_REASON_REQUIRED` | 400 | Failed result lacks reason. |
| Stickers | `STICKER_NOT_FOUND` | 404 | Permitted sticker is absent. |
| Stickers | `STICKER_INVALID_TRANSITION` | 409 | Sticker state/action is invalid. |
| Stickers | `STICKER_NUMBER_CONFLICT` | 409 | Sticker number conflicts. |
| Stickers | `CERTIFICATE_NUMBER_CONFLICT` | 409 | Certificate number conflicts. |
| Stickers | `STICKER_PASS_INSPECTION_REQUIRED` | 409 | Ready/issue operation lacks completed PASS prerequisite. |
| General | `VALIDATION_ERROR` | 400 | Request/path/query validation fails. |
| General | `RESOURCE_NOT_FOUND` | 404 | Generic non-sensitive resource lookup fails. |
| General | `CONFLICT` | 409 | A safe conflict lacks a more specific code. |
| General | `RATE_LIMIT_EXCEEDED` | 429 | Endpoint policy throttles request. |
| General | `INTERNAL_SERVER_ERROR` | 500 | Unexpected sanitized server failure. |

## 24. Security rules

- For every protected request, verify access-token signature and expiry, `typ = 'access'`, that the user still exists and is `ACTIVE`, that its non-secret `sid` belongs to that user, and that the refresh session is neither revoked nor expired; then enforce role and ownership before data read or mutation. Admin routes never grant citizen access by query parameter. Refresh validation additionally locks the session row and verifies the signed session ID, user, hidden hash, fixed expiry, and revocation state.
- Hash passwords securely; never select/serialize `passwordHash`. Store/compare verification codes and refresh tokens as hashes and never return them except the narrowly approved local-development `developmentCode` behavior. Raw refresh tokens exist only in HttpOnly cookies and are never stored in PostgreSQL.
- Authorize every document/certificate download before storage access. Return a controlled stream/download and never an internal path/key.
- Redact audit old/new values and never return code, password/token, private file, or sensitive authentication data. Do not log access tokens or plaintext codes.
- Allowlist query filters and sort fields. Reject mass-assignment fields and use explicit transition endpoints rather than generic status changes.
- Rate-limit register, verify, resend verification, login, refresh, logout, password-reset request, and password-reset confirm by suitable client/identifier dimensions. Prevent account enumeration on reset request.
- Refresh cookies are always HttpOnly, use `Secure=true` in production, default to `SameSite=Lax`, and derive the auth-scoped cookie path from `API_PREFIX`. Rotation preserves the original fixed session deadline; its new cookie expiry is only the remaining lifetime.
- Return stable JSON errors without raw entities, SQL errors, stack traces, or implementation infrastructure details. Do not create broad DELETE APIs.

## 25. Transaction and concurrency mapping

Every row is all-or-nothing: failure rolls back created/updated domain rows, timeline rows, notifications, and audit rows. Reads are revalidated within the transaction; locks below may be row locks or an equivalent database-safe concurrency mechanism.

| Operation | Reads / locks and constraints | Creates / updates / effects |
| --- | --- | --- |
| Register | Read normalized user identifiers; unique phone/email constraints. | Create citizen/user/profile and hashed verification record atomically. |
| Verify registration | Lock eligible verification code and user; check hash, expiry, unused state, attempts. | Mark code used, increment attempt state as needed, activate citizen, set verification time, and create one refresh session before issuing the response/cookie after commit. |
| Login | Resolve the normalized identifier, verify password hash and `ACTIVE` status. | Update `lastLoginAt` and create one refresh session in the same transaction before returning the access-token response/cookie. |
| Refresh | Lock the signed session-ID row; validate token signature, user, hidden hash, fixed expiry, and revocation state. | Rotate the token hash for the same row and update `lastUsedAt` without changing `expiresAt`; token reuse marks reuse time and revokes only that session. |
| Logout | Validate/lock the refresh-session row only when a cookie can be matched. | Revoke only that current session when valid and always clear the cookie; invalid/missing/expired/revoked cookies remain non-disclosing/idempotent. |
| Reset confirm | Lock eligible reset code/user; check hash/expiry/unused. | Replace password hash, consume code, and revoke all active refresh sessions atomically; do not create a session. |
| Admin user status | Lock user and validate `ACTIVE`/`DISABLED` transition. | Update status; when disabling, revoke all active refresh sessions in the same transaction and create audit effect. Activating does not restore sessions. |
| Application submission | Lock/read citizen-owned vehicle; enforce `uq_active_application_per_vehicle`. | Create application/reference/snapshots, 3 current document rows, submitted timeline, notification, audit. |
| Correction resubmission | Lock application/current documents; enforce correction status and `uq_current_document_per_type`. | Mark old current rows false; insert replacement versions/current rows; update application workflow; `CORRECTION_RESUBMITTED` timeline and audit only—no notification. |
| Citizen/admin application cancellation | Lock application; check allowed state, confirmed payment, completed inspection, actor/reason, and any scheduled appointment. | If scheduled appointment exists, cancel it, set cancellation fields, release capacity, and create `APPOINTMENT_CANCELLED` timeline/notification/audit. Then set application cancellation fields/status and create `APPLICATION_CANCELLED` timeline/notification/audit. For an admin cancellation after confirmed payment, preserve that payment unchanged as immutable history; no reversal, deletion, automatic refund, refund table, or refund/reversal endpoint is involved. With no scheduled appointment, create only application effects. |
| Review start/correction/ready | Lock application/current documents; validate exact state and approvals for ready. | Update review/workflow fields; required timeline, notification, audit. |
| Document review | Lock current document and validate outcome/reason. | Update review fields and audit effect. |
| Appointment booking | Lock/protect slot; read application/payment; verify ready/open/capacity; count scheduled; rely on `uq_scheduled_appointment_per_application`. | Create appointment; create pending pay-at-station payment if absent; timeline, notification, audit. |
| Appointment cancellation | Lock appointment; verify scheduled, actor, time/reason. | Set cancellation fields/state; timeline, notification, audit. |
| Appointment reschedule | Lock old appointment and target slot; apply booking checks/capacity/partial uniqueness. | Cancel old, create new; effects as required, never update `slotId`. |
| Admin no-show | Lock appointment; verify eligible scheduled/no inspection. | Set no-show state/fields; timeline, notification, audit. |
| Payment confirmation | Lock `PENDING` or `REJECTED` payment; verify pay-at-station and unique receipt number. | Confirm payment/receipt/actor/moment while preserving rejection fields if present; `PAYMENT_CONFIRMED` timeline, notification, audit. |
| Payment rejection | Lock `PENDING` payment; validate reason. | Set rejected state/actor/reason; audit only—no `PAYMENT_FAILED` timeline/notification. A rejected record remains eligible for later confirmation. |
| Inspection creation | Lock/read appointment/application/payment; verify ready, confirmed, composite application/appointment relation, unique appointment inspection. | Insert one pending inspection and required audit effect. |
| Inspection completion | Lock pending inspection/appointment/application; validate result/reason. | Complete inspection and appointment together; PASS creates/retains sticker and effects, FAIL terminalizes application without sticker; timeline/notification/audit. |
| Sticker ready | Lock eligible sticker/application. | Record ready state/moment/actor; `STICKER_READY` timeline, notification, audit. |
| Sticker issue | Lock sticker/application/inspection; verify completed PASS. | Record issuance, issue sticker, complete application atomically; issuance/completion timeline, notification, audit. |
| System announcement | Read/lock active-citizen recipient set as appropriate. | Insert exactly one in-app system-announcement notification per active citizen plus audit; roll back every recipient insert on failure. |

## 26. Open non-blocking implementation details

The following must be finalized before coding their affected validation/storage behavior, but do not block route definition: application reference-number, invoice-number, receipt-number, sticker-number, and certificate-number formats; exact file MIME allowlist and maximum size; free-text limits; password policy and approved Argon2id parameters; JWT key-rotation operational procedure; storage provider/key format; vehicle edits after application snapshot creation; notification wording; audit-value redaction mechanics; record retention duration; exceptional administrative correction procedure; and whether local-development verification code is returned, safely logged, or both. The session-bound access-token claim set, 30-minute maximum access lifetime, seven-day fixed refresh-session lifetime, cookie protections, rejected-payment retry/record-preservation behavior, and confirmed-payment handling on admin cancellation are approved and are not open decisions.

## 27. First-release exclusions

Excluded: refresh-session listing/device management, logout-all, restoration of revoked sessions, Passport, OAuth/social/biometric/external identity, external vehicle registry, online/QR/card/provider payment, payment refunds and reversals (including refund/reversal endpoints, refund tables, and new refund/payment statuses), email/SMS delivery, STAFF endpoints, server-side drafts, reinspection, reopening terminal applications, targeted or scheduled announcements, broad analytics, hard deletes, citizen audit access, arbitrary status PATCH endpoints, seed-data endpoints, migration endpoints, and schema-synchronization endpoints.

## 28. Proposed implementation order

1. **Essential foundation:** shared response/error conventions, validation, rate-limit policy, access-token and refresh-session authentication/authorization, cookie handling, ownership checks, current user, and profile.
2. **Essential citizen workflow:** vehicles; multipart application submission/list/detail; documents and correction replacement; station/slot discovery; appointments; payment viewing; inspection/sticker viewing; notifications.
3. **Essential admin workflow:** user status/listing; application and document review; stations/slots; appointments; payment decisions; inspections; stickers; audit-log reads.
4. **Optional convenience:** read-only admin dashboard summary after the core workflows are tested.

Implementation must preserve the approved state transitions, constraints, transaction boundaries, and no-delete policy before adding optional convenience work.
