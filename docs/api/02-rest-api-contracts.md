# REST API contracts

## Scope

This is the implemented HTTP contract as of Phases 2–4. Routes below are
relative to `API_PREFIX`, which defaults to `/api`; examples therefore use
`/api`. A route is documented only when a controller implements it. Empty
foundation controllers and entity-only domains do not imply an endpoint.

Unless stated otherwise, successful single-resource responses use:

```json
{ "data": {} }
```

List responses use:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Validation rejects unknown body/query fields. UUID route parameters require
UUID version 4. Dates described as `date-only` must be `YYYY-MM-DD`; time or
time-zone values are rejected for the Phase 4 scheduling DTOs.

## Authentication and authorization

Protected routes require `Authorization: Bearer <access-token>`. Citizen and
admin routes also enforce their role. A valid JWT is insufficient when its
backing refresh session is revoked/expired or its user is not `ACTIVE`.

All auth routes are public. `refresh` and `logout` use the refresh-token cookie
and reject a JSON request body.

| Method and path                     | Request body                                                                                                   | Success                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /auth/register`               | `phone?`, `email?`, `verificationIdentifier?`, `password`, `nameKh`, `nameEn`, `nationalIdNumber?`, `address?` | 201, registration response; development code only when configured for local development. |
| `POST /auth/verify`                 | `identifier`, six-digit `code`                                                                                 | 200, access-token response and refresh cookie.                                           |
| `POST /auth/resend-verification`    | `identifier`                                                                                                   | 202, registration response.                                                              |
| `POST /auth/login`                  | `identifier`, `password`                                                                                       | 200, access-token response and refresh cookie.                                           |
| `POST /auth/password-reset/request` | `identifier`                                                                                                   | 202, registration response.                                                              |
| `POST /auth/password-reset/confirm` | `identifier`, six-digit `code`, `newPassword`                                                                  | 200.                                                                                     |
| `POST /auth/refresh`                | no JSON body; refresh cookie                                                                                   | 200, new access-token response and rotated refresh cookie.                               |
| `POST /auth/logout`                 | no JSON body; refresh cookie when present                                                                      | 200, `{ "message": "Logged out successfully." }`; clears cookie.                         |

`identifier` is a normalized supported phone number or email. Password fields
are 8–128 characters. Authentication responses do not expose refresh tokens,
token hashes, or session IDs as separate response properties.

## Users, vehicles, and inspection categories

These routes are currently implemented and remain independent of the Phase 4
scheduling workflow.

| Method and path                                          | Role             | Contract                                                                                                                |
| -------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /users/me`                                          | CITIZEN or ADMIN | Current user and applicable profile.                                                                                    |
| `PATCH /users/me/citizen-profile`                        | CITIZEN          | Any supported subset of `nameKh`, `nameEn`, `nationalIdNumber`, `address`.                                              |
| `GET /admin/users`                                       | ADMIN            | Paginated users; supported filters include role, status, phone, email, created date range, and allowlisted sort fields. |
| `GET /admin/users/:id`                                   | ADMIN            | User detail.                                                                                                            |
| `PATCH /admin/users/:id/status`                          | ADMIN            | `{ "status": "ACTIVE"                                                                                                   | "DISABLED" }`. |
| `GET /vehicles`                                          | CITIZEN          | Paginated owned vehicles.                                                                                               |
| `POST /vehicles`                                         | CITIZEN          | Creates an owned vehicle using `CreateVehicleRequestDto`.                                                               |
| `GET /vehicles/:vehicleId`                               | CITIZEN          | Owned vehicle detail.                                                                                                   |
| `GET /admin/vehicles`                                    | ADMIN            | Paginated vehicle list with implemented filters.                                                                        |
| `GET /admin/vehicles/:vehicleId`                         | ADMIN            | Vehicle detail.                                                                                                         |
| `PATCH /admin/vehicles/:vehicleId/classification`        | ADMIN            | `{ "inspectionCategoryId": "uuid", "reason": "..." }`.                                                                  |
| `GET /admin/vehicles/:vehicleId/classification-history`  | ADMIN            | Paginated history.                                                                                                      |
| `GET /admin/inspection-vehicle-categories`               | ADMIN            | Paginated category list.                                                                                                |
| `GET /admin/inspection-vehicle-categories/:categoryId`   | ADMIN            | Category detail.                                                                                                        |
| `POST /admin/inspection-vehicle-categories`              | ADMIN            | Creates a category.                                                                                                     |
| `PATCH /admin/inspection-vehicle-categories/:categoryId` | ADMIN            | Updates supported category fields.                                                                                      |

Pagination defaults are `page=1`, `limit=20`, and `sortOrder=desc`; the
maximum limit is 100. DTO-specific sort/filter allowlists apply.

## Application and document contract

### Application representation

Citizen application responses contain:

`id`, `referenceNumber`, `citizenId`, `vehicleId`, `status`,
`currentCorrectionReason`, `currentRejectionReason`, `submittedAt`,
`reviewStartedAt`, `readyForInspectionAt`, `completedAt`, `cancelledAt`,
`cancellationReason`, `createdAt`, and `updatedAt`.

`referenceNumber`, snapshots, and `submittedAt` are `null` while an application
is a DRAFT. The current citizen response does not expose the stored scheduling
preference, even though the preference-saving route returns the persisted
entity for that operation.

The exact `ApplicationStatus` values are:

`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CORRECTION_REQUIRED`,
`APPOINTMENT_SELECTION_REQUIRED`, `APPROVED`, `REJECTED`,
`REINSPECTION_REQUIRED`, `CANCELLED`, `COMPLETED`.

### Citizen application routes

| Method and path                                                    | Body                                                    | Implemented behavior                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /applications`                                               | `{ "vehicleId": "uuid" }`                               | Creates a persisted `DRAFT` for a vehicle owned by the caller. 201.                                                                                                 |
| `POST /applications/:applicationId/documents`                      | `multipart/form-data`: `documentType`, `file`           | Uploads one document while DRAFT or correction-required. 201.                                                                                                       |
| `GET /applications/:applicationId/documents`                       | —                                                       | Lists current owned documents.                                                                                                                                      |
| `GET /applications/:applicationId/documents/:documentType/history` | page query                                              | Lists owned document-version history.                                                                                                                               |
| `GET /applications/:applicationId/documents/:documentId/download`  | —                                                       | Streams an owned document; this is a file response, not the JSON envelope.                                                                                          |
| `POST /applications/:applicationId/scheduling-preference`          | `{ "stationId": "uuid", "capacityDate": "YYYY-MM-DD" }` | DRAFT only. Validates availability, saves preference, and makes no reservation. 201.                                                                                |
| `POST /applications/:applicationId/submit`                         | —                                                       | DRAFT only. Validates documents/profile/vehicle/preference, creates snapshots/reference number, and moves to `SUBMITTED` without reserving. 201.                    |
| `POST /applications/:applicationId/resubmit`                       | —                                                       | `CORRECTION_REQUIRED` only; validates current required documents and returns to `SUBMITTED`. 201.                                                                   |
| `POST /applications/:applicationId/appointment-selection`          | `{ "stationId": "uuid", "capacityDate": "YYYY-MM-DD" }` | `APPOINTMENT_SELECTION_REQUIRED` only. Atomically reserves, saves the new preference, creates an internal daily-capacity appointment, and moves to `APPROVED`. 201. |
| `POST /applications/:applicationId/cancel`                         | `{ "reason"?: "string" }`                               | Allowed only from DRAFT, SUBMITTED, CORRECTION_REQUIRED, or APPOINTMENT_SELECTION_REQUIRED. 201.                                                                    |
| `GET /applications`                                                | pagination query                                        | Lists the caller's applications.                                                                                                                                    |
| `GET /applications/:applicationId/status-history`                  | pagination query                                        | Lists the caller's immutable status history.                                                                                                                        |
| `GET /applications/:applicationId`                                 | —                                                       | Gets the caller's application.                                                                                                                                      |

Required `documentType` values are exactly
`VEHICLE_REGISTRATION_CARD`, `PREVIOUS_INSPECTION_CERTIFICATE`, and
`CITIZEN_ID_CARD`. `NATIONAL_ID` is rejected. Uploads accept PDF, JPG/JPEG, or
PNG with matching MIME type, a non-zero file, and a maximum size of 5 MiB.

### Admin application and document routes

| Method and path                                                          | Body/query                                                                                             | Implemented behavior                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `GET /admin/applications`                                                | pagination plus implemented status, reference, plate, citizen-search, submitted-date, and sort filters | Lists submitted applications only; drafts are excluded.                 |
| `GET /admin/applications/:applicationId`                                 | —                                                                                                      | Submitted application detail, including snapshots.                      |
| `GET /admin/applications/:applicationId/status-history`                  | pagination query                                                                                       | Immutable status history.                                               |
| `GET /admin/applications/:applicationId/documents`                       | —                                                                                                      | Current documents.                                                      |
| `GET /admin/applications/:applicationId/documents/:documentType/history` | pagination query                                                                                       | Document-version history.                                               |
| `GET /admin/applications/:applicationId/documents/:documentId/download`  | —                                                                                                      | Streams a document.                                                     |
| `POST /admin/applications/:applicationId/start-review`                   | —                                                                                                      | `SUBMITTED → UNDER_REVIEW`. 201.                                        |
| `POST /admin/applications/:applicationId/request-correction`             | `{ "documentTypes": [DocumentType, ...], "reason": "1–500 chars" }`                                    | `UNDER_REVIEW → CORRECTION_REQUIRED`. 201.                              |
| `POST /admin/applications/:applicationId/reject`                         | `{ "reason": "1–500 chars" }`                                                                          | `UNDER_REVIEW → REJECTED`. 201.                                         |
| `POST /admin/applications/:applicationId/reopen`                         | `{ "reason": "1–500 chars" }`                                                                          | `REJECTED → UNDER_REVIEW`. 201.                                         |
| `POST /admin/applications/:applicationId/review-pass`                    | —                                                                                                      | Performs reservation orchestration; see scheduling behavior below. 201. |

There is no `POST /admin/applications/:id/approve` endpoint. `review-pass` is
not a status-only operation.

## Phase 4 station/date scheduling contract

### Citizen discovery

| Method and path                            | Role    | Response data                                                                                                                |
| ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /stations`                            | CITIZEN | Active stations only, sorted by code then ID. Each item is `id`, `code`, `nameKh`, `nameEn`, `province`, `address`, `phone`. |
| `GET /stations/:stationId/available-dates` | CITIZEN | `{ stationId, capacityDate }[]`, sorted ascending. The station must be active.                                               |

A date appears in availability only if it is later than Cambodia local today,
the capacity row is open, its station is active, and it has remaining capacity.

### Admin daily-capacity routes

All routes below require ADMIN. A capacity body never contains `reservedCount`.

| Method and path                                                     | Request                                                                                    | Response / rule                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `GET /admin/scheduling/daily-capacities`                            | optional `stationId` UUID query                                                            | Daily-capacity rows ordered by date then ID.                                     |
| `GET /admin/scheduling/daily-capacities/:dailyCapacityId`           | —                                                                                          | One daily-capacity row.                                                          |
| `POST /admin/scheduling/daily-capacities`                           | `{ "stationId": "uuid", "capacityDate": "YYYY-MM-DD", "dailyCapacity": positive integer }` | Creates a row with `reservedCount=0` and `isClosed=false`. 201.                  |
| `POST /admin/scheduling/daily-capacities/:dailyCapacityId/capacity` | `{ "dailyCapacity": positive integer }`                                                    | Atomically changes the total only when it remains at least `reservedCount`. 201. |
| `POST /admin/scheduling/daily-capacities/:dailyCapacityId/close`    | —                                                                                          | Sets `isClosed=true`; does not release reservations. 201.                        |
| `POST /admin/scheduling/daily-capacities/:dailyCapacityId/reopen`   | —                                                                                          | Sets `isClosed=false`. 201.                                                      |

### Review-pass and selection results

`POST /admin/applications/:applicationId/review-pass` is valid only while the
application is `UNDER_REVIEW` and has a stored paired preference.

- When the preferred date is reservable, it increments `reserved_count`,
  creates exactly one `SCHEDULED` appointment, writes
  `UNDER_REVIEW → APPROVED` status history, and returns the admin application
  detail envelope.
- When it is unavailable (absent, non-future, closed, full, or the station is
  inactive), it writes `UNDER_REVIEW → APPOINTMENT_SELECTION_REQUIRED` status
  history and returns that application state. It creates no appointment and
  does not increment a counter.
- A later citizen `appointment-selection` request applies the success branch to
  their new selection and moves from `APPOINTMENT_SELECTION_REQUIRED` to
  `APPROVED`.

The capacity change, appointment creation, application status update, and
status-history insert share one database transaction. A later failure rolls
back the earlier reservation. Repeating review-pass after a successful pass is
an invalid transition and cannot double-reserve.

## Persistence representation relevant to the API

Migration 9 introduced `inspection_station_daily_capacities`:

`id`, `station_id`, `capacity_date`, `daily_capacity`, `reserved_count`,
`is_closed`, `created_at`, `updated_at`.

It has a unique station/date pair, positive `daily_capacity`, and
`0 <= reserved_count <= daily_capacity`. `renewal_applications` stores nullable
paired `preferred_inspection_station_id` and `preferred_inspection_date`:
either both are null or both are populated.

`appointments` retains compatibility with `appointment_slots`. `slot_id` is
nullable, `daily_capacity_id` is nullable, and a database XOR check requires
exactly one of them. Phase 4 writes a `daily_capacity_id` appointment with
`slot_id = null`. The existing appointment status enum and `SCHEDULED` status
remain in use. There is no current appointment GET/list/cancel/reschedule HTTP
contract.

## Errors and unimplemented routes

Errors use the common shape:

```json
{
  "statusCode": 409,
  "code": "APPLICATION_INVALID_TRANSITION",
  "message": "Application transition is invalid",
  "timestamp": "...",
  "path": "/api/..."
}
```

Relevant current scheduling outcomes include `STATION_NOT_FOUND`,
`APPLICATION_NOT_FOUND`, `RESOURCE_NOT_OWNED`, `CONFLICT`, and
`APPLICATION_INVALID_TRANSITION`. Validation failures use `VALIDATION_ERROR`.

No routes currently exist for appointment CRUD, slot management, payment,
inspection, sticker/certificate, notification, audit, dashboard, reports, or
announcements, even though some matching controller/entity foundations are
present in the repository. Do not use older planned `/inspection-stations`,
`/appointment-slots`, `/appointments`, or payment/inspection paths as current
contracts.
