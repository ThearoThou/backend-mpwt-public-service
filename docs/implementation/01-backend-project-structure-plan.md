# Backend project structure and implementation plan

## 1. Purpose and source of truth

This is the Task 5A implementation plan for the MPWT Vehicle Inspection Renewal Service. It is documentation only. It translates the approved first-release workflow and REST contract into a practical NestJS modular monolith for one student over three months; it does not create an OpenAPI document or implementation code.

Task 6A common-foundation implementation is complete. Task 6B authentication
and users implementation has not started. This document remains the
implementation plan guiding the remaining phases.

Authoritative design sources are:

- `docs/api/01-users-workflow-and-permissions.md` (workflow and permissions)
- `docs/api/02-rest-api-contracts.md` (77 REST endpoints, response/request contracts, errors, and transactions)
- `docs/database/mpwt_vehicle_inspection_full_schema.dbml`
- `docs/database/mpwt_vehicle_inspection_constraints.sql`
- the 16 TypeORM entities, 18 enums, and three approved migrations.

When this plan conflicts with those sources, the approved API and database documents win. The plan introduces no table, field, enum, endpoint, workflow transition, or database rule.

## 2. Current backend structure

The repository is already a NestJS 11 / TypeORM / PostgreSQL modular scaffold, not an empty project.

| Area | Actual current state | Planning implication |
| --- | --- | --- |
| Application bootstrap | `src/main.ts` creates `AppModule`, applies the `/api/v1` global prefix, global `ValidationPipe`, and global exception filter through the shared API configuration, then listens on `PORT` (default `3000`). The unused Nest starter root route has been removed. | Retain these foundation concerns centrally; do not duplicate them by controller. |
| App composition | `AppModule` imports Config, Database, Auth, Users, Vehicles, Applications, Scheduling, Payments, Inspections, Stickers, Notifications, Activity, Files, Admin, and Common modules. | Retain this modular-monolith composition. |
| Feature modules | Each approved domain has an existing module, controller shell(s), service shell, and `TypeOrmModule.forFeature` for its local entities where needed. Current feature controllers/services are empty. | Implement within these shells rather than start a second module layout. Existing controller route prefixes are placeholders, so align them to Task 4B only as each endpoint is implemented. |
| Data layer | `database.entities.ts` centrally lists all 16 entities. `DatabaseModule` uses `forRootAsync`; shared options use a runtime-relative migration glob and have `synchronize`, `dropSchema`, and `migrationsRun` disabled. | Keep TypeORM, PostgreSQL, migration discipline, and explicit entity ownership. |
| Migrations | `1785378252215-InitialSchema.ts`, `1785380837520-AddAdvancedDatabaseConstraints.ts`, and `1785380837521-CreateRefreshSessions.ts` are present. | Treat the approved constraints as final integrity protections; do not compensate for them with schema redesign. |
| Configuration | `ConfigModule` is global and validates the existing application/database variables. `.env.example` and Docker Compose define local PostgreSQL/pgAdmin development settings. | Extend validation deliberately when an approved feature needs a new setting; keep `.env` ignored and secrets out of source. |
| Tests | Jest unit configuration is rooted at `src`; an e2e Jest config exists. Foundation unit and e2e tests cover the global API configuration, error handling, pagination, response envelopes, and safe request context. | Add focused domain/service, authorization, integration, and e2e tests in phases rather than broad tests first. |
| Tooling | `nest-cli.json` deletes `dist` on build; TypeScript is strict with NodeNext; ESLint runs with `--fix`. | Follow current build/lint/test commands and do not edit `dist` manually. |
| Documentation | Task 4A and 4B are complete. `README.md` remains mostly the Nest starter text and includes stale Task 3A migration wording. | This plan does not rewrite the README; correct it separately if explicitly tasked. |

The current logical source layout is:

```text
src/
  activity/        timeline and audit entities; audit controller shell
  admin/           dashboard/report controller shells
  applications/    application and document entities; citizen/admin/document shells
  auth/            verification-code and refresh-session entities; auth shells
  common/          error, HTTP, pagination, and request-context foundation
  config/          global config module and environment validator
  database/        entity registry, TypeORM options/module, DataSource, migrations
  files/           empty file-service shell
  inspections/    inspection entity and admin shell
  notifications/  notification entity and citizen/admin shells
  payments/        payment entity and citizen/admin shells
  scheduling/      stations, slots, appointments and their shells
  stickers/        sticker entity and citizen/admin shells
  users/           user/citizen-profile entities and user/profile shells
  vehicles/        vehicle entity and citizen/admin shells
```

## 3. Architecture principles

- Use one deployable NestJS REST application and one PostgreSQL database: a modular monolith.
- Keep the approved stack: NestJS, TypeORM, PostgreSQL, REST, 30-minute Bearer access tokens, and seven-day fixed rotating refresh sessions.
- Prefer small explicit services, DTOs, mappers, policy functions, and transaction boundaries over generic base classes, repositories wrapping repositories, CQRS, event sourcing, or a message broker.
- Keep the existing entity placement (`<module>/entities`) and enum placement (`<module>/enums`). Do not move them as a prerequisite for feature work.
- Make controllers thin: validate/authorize route-level concerns, call a named service method, and return mapped contract data.
- Keep business transitions explicit. Database constraints are the final integrity layer, never the only ownership or workflow check.
- Do not introduce microservices, GraphQL, Kubernetes, separate deployment services, a replacement ORM/database, or premature caching/performance infrastructure.
- The existing frontend Keycloak settings are outside this backend task. They do not change the approved backend JWT design.

## 4. Module map and decisions

| Existing module | First-release responsibility | Decision |
| --- | --- | --- |
| `AuthModule` | Register, verify, resend, login, refresh, logout, reset, JWT issuance/validation support, refresh-session persistence/revocation, and admin bootstrap. | Retain. It owns verification codes, `RefreshSession`, and authentication orchestration, not profiles or broad authorization policy. |
| `UsersModule` | Current-user response, citizen-profile update, admin user list/detail/status. | Retain. It owns users and citizen profiles. |
| `VehiclesModule` | Citizen vehicle create/list/detail and admin vehicle reads. | Retain. No general update/delete module API. |
| `ApplicationsModule` | Submission, reads, eight application transitions, document review/replacement orchestration. | Retain combined application/document domain; do not create a separate Documents module. |
| `FilesModule` | File storage interface and implementations used by applications/stickers. | Retain. It does not own document workflow records. |
| `SchedulingModule` | Inspection stations, appointment slots, appointment booking/cancel/reschedule/no-show. | Retain combined bounded domain; do not split merely for folder count. |
| `PaymentsModule` | Citizen payment read; admin confirmation/rejection. | Retain. Payment creation remains scheduling/application workflow-driven. |
| `InspectionsModule` | Inspection creation/completion, including appointment completion and application failure transition. | Retain. |
| `StickersModule` | Sticker reads, ready-for-pickup, issuance, certificate access; application completion on issue. | Retain. |
| `NotificationsModule` | Citizen read/mark-read and all-active-citizen system announcements. | Retain. It can be called transactionally by business modules. |
| `ActivityModule` | `TimelineService`, `AuditService`, and admin audit-log reads. | Retain and give the existing generic `ActivityService` two explicit responsibilities/services when implementation begins. |
| `AdminModule` | Optional dashboard summary only. `AdminReportsController` has no approved first-release contract route. | Retain for dashboard. Defer or remove/rename the reports shell only in a separately scoped cleanup; do not invent reporting endpoints. |
| `CommonModule` | Small shared HTTP/auth/validation/error/pagination primitives. | Retain as a focused foundation, not a framework. |
| `ConfigModule` | Validated configuration. | Retain as global. |
| `DatabaseModule` | TypeORM connection/options and migrations. | Retain. Domain services use injected repositories and transaction `EntityManager`; no new repository abstraction layer. |

No new first-release domain module is needed. In particular, separate modules for documents, appointment slots, audit logs, application timeline, or a generic shared repository layer are rejected because their current owners are clear.

## 5. Proposed folder structure

This is an incremental target, not a Task 5A file move. Existing flat controller/service files continue to work while a module is implemented. Add a folder only when it has more than one real responsibility.

```text
src/
  common/
    auth/                 # JwtAuthGuard, Roles guard/decorator, ActiveUserGuard, CurrentUser
    errors/               # DomainException, error-code/status mapping, global filter
    http/                 # success/page envelope helpers and response types
    pagination/           # base page/query DTOs and sort allowlist helpers
    request-context/      # IP/user-agent extraction type/helper
    validation/           # shared UUID/date/enum transformations where truly shared
    transactions/         # small EntityManager transaction helper/types
    types/                # genuinely shared contract/actor types only
  config/
    config.module.ts
    environment.validation.ts
  database/
    migrations/
    database.entities.ts
    database.module.ts
    database.options.ts
    data-source.ts
  auth/
    controllers/
    dto/requests/
    services/             # AuthService plus narrow refresh-session persistence/revocation collaborator
    mappers/
    entities/
    enums/
  users/
    controllers/
    dto/requests/ queries/
    services/ mappers/ policies/
    entities/ enums/
  vehicles/
    controllers/
    dto/requests/ queries/
    services/ mappers/ policies/
    entities/
  applications/
    controllers/
    dto/requests/ queries/
    services/ mappers/ policies/
    entities/ enums/
  scheduling/
    controllers/
    dto/requests/ queries/
    services/ mappers/ policies/
    entities/ enums/
  payments/ inspections/ stickers/ notifications/ activity/
    controllers/ dto/ services/ mappers/ policies/ entities/ enums/
  files/
    storage/              # FileStorage interface and local-development implementation
    files.service.ts
  admin/
    controllers/ services/ mappers/
```

`controllers`, `dto`, `mappers`, and `policies` are proposed additions only where a module has multiple route groups, nontrivial input, or reusable ownership/workflow checks. A small module may keep a single controller/service at its root. A barrel `index.ts` is optional and should not be added merely for style.

Possible later refactoring: once endpoint implementation starts, relocate the current placeholder controllers into `controllers/` and DTOs into `dto/requests` or `dto/queries` in the same feature change. Do not move entities or perform mass reformatting first.

## 6. Common foundation

| Concern | Current or proposed owner/location | Practical rule |
| --- | --- | --- |
| Configuration validation | Existing `config/environment.validation.ts` | Extend the typed validator alongside new approved environment settings; fail fast at startup. |
| Database configuration | Existing `database/` files | Keep shared TypeORM options for Nest and CLI DataSource, disabled synchronization, and migrations only. |
| Global validation | `main.ts` through the shared API configuration: one global `ValidationPipe` | The implemented pipe enables whitelist, forbids unknown input, transforms explicit DTO fields, and produces contract-safe validation errors. DTOs remain explicit per write/query route. |
| Response envelopes | `common/http/` | The implemented helpers/types create `{ data }` and `{ data, meta }`; do not use an interceptor that serializes entities directly. |
| Errors | `common/errors/` | The implemented `DomainException` carries one approved code, safe message, optional validation details, and intended HTTP status. The implemented global filter produces `ApiErrorResponse`. |
| Auth helpers | `common/auth/` | Keep Jwt guard, roles decorator/guard, active-user guard, and current-user decorator together. Domain ownership stays out of per-resource guards. |
| Pagination/filter/sort | `common/pagination/` plus feature query DTOs | The implemented base page fields are shared; every feature provides its own explicit filter and sort allowlist. |
| Date/enum validation | DTOs plus small shared validators | Use shared UUID/date-range/enum helpers only when repeated; avoid a generic query parser. |
| Mappers | Each feature's `mappers/` | Explicit functions/classes map entity/projection to Task 4B responses. No TypeORM entity is serialized directly. |
| Request context | `common/request-context/` | The implemented helper extracts safe client IP/user-agent data for audit writes; never put credentials/tokens in audit data. |
| Transactions | `common/transactions/` only if a small helper removes repetition | Prefer `DataSource.transaction(async manager => ...)`; domain services accept an optional/provided `EntityManager` for nested writes. |
| Number generation | Feature-local interfaces (applications/payments/stickers) or a small `common/types` contract if shared | Generate application reference, invoice, receipt, sticker, and certificate values behind named functions. Formats remain approved implementation constants. |
| Clock | A small injected clock only in modules whose date tests need deterministic behavior | Do not add a time abstraction globally until the first test benefits from it. |

## 7. Authentication architecture

`AuthService` remains the public orchestration owner. It should coordinate user/profile creation with `UsersService` through a narrow exported method, verification-code persistence, password/code hashing, access/refresh JWT creation, refresh-session persistence, and safe responses. It must not expose hashes, refresh-session records, or raw credentials.

| Flow | Planned service behavior |
| --- | --- |
| Registration | Normalize identifiers, reject conflicts, create `CITIZEN` + citizen profile in `PENDING_VERIFICATION`, choose the `REGISTER_ACCOUNT` destination, hash/store the code, and return only approved registration/development response data. |
| Both identifiers | `RegisterRequest.verificationIdentifier` is required only when both phone and email are supplied. It must equal one supplied normalized identifier and selects the single `REGISTER_ACCOUNT` destination. The client never chooses purpose. |
| Verification/resend | Endpoint selects `REGISTER_ACCOUNT` server-side; lock/check the latest eligible code, expiry, single-use state, and attempt count. Verification sets the matching verified timestamp, activates the citizen, creates one refresh session, then returns `AuthTokenResponse` and refresh cookie only after commit. |
| Login | Resolve one normalized phone/email identifier, compare password hash, require `ACTIVE`, update `lastLoginAt`, create one refresh session for the device/browser, and issue a session-bound access token with a maximum 30-minute lifetime plus refresh cookie in one transaction. Do not reveal account existence beyond approved errors. |
| Refresh session | Use a signed refresh token that carries a non-secret session UUID; lock that row, verify the signature, user, hidden Argon2id hash, fixed seven-day expiry, and revocation state, then rotate the hash for the same row. Rotation updates usage but never moves `expiresAt`; a rotated-token reuse revokes only that row. |
| Logout and revocation | Logout is idempotent: revoke only the current valid cookie session and always clear the cookie, immediately blocking access tokens bound to it. Reset confirmation and disabling a user revoke all active user sessions, immediately blocking all access tokens bound to them; rotated-token reuse revokes the affected session and immediately blocks its access tokens. Enabling never restores/recreates a session, and logging out one device does not affect another active device session. |
| JWT and cookies | An internal Auth token collaborator creates/verifies session-bound, maximum-30-minute access tokens and fixed-seven-day refresh tokens with separate secrets. Each access token contains `sub` (user ID), `role` (user role), `sid` (the non-secret refresh-session identifier), and `typ: 'access'`. For every protected request, the future access-token guard verifies signature and expiry, `typ = 'access'`, that the user still exists and is `ACTIVE`, that `sid` belongs to that user, and that the session is unrevoked and unexpired. An access-token expiry never exceeds its session `expiresAt`. Refresh cookies are always HttpOnly, `Secure` in production, default `SameSite=Lax`, and auth-path scoped from `API_PREFIX`; rotation uses remaining fixed lifetime. |
| Roles | `@Roles(UserRole.ADMIN)` metadata plus one roles guard handles broad ADMIN routes. CITIZEN/private ownership checks happen later in service/policy. |
| Admin bootstrap | A controlled CLI/bootstrap service or explicitly gated startup command creates initial admin only from approved configuration. It is not a public route. |
| Local development code | A development-only configuration flag determines whether an ephemeral plaintext code is returned in the approved response or written to a safe development log. It is never stored in plaintext or logged in production. |

The current dependency list contains neither a dedicated Nest JWT package nor a password-hashing package. Before implementing Phase 2, approve `@nestjs/jwt`, `argon2` with Argon2id for passwords and verification codes, and minimal cookie parsing support only if needed. Do not add Passport, OAuth, social/biometric identity, or a generic identity platform.

## 8. Authorization and ownership

Guards establish authentication, active status, and broad role. Services or small module policies load the resource under the caller's permitted scope and enforce workflow preconditions. PostgreSQL foreign keys, unique/partial indexes, checks, and transaction locks provide final integrity.

| Resource | Ownership enforcement |
| --- | --- |
| Vehicles | Citizen queries include `linkedCitizenId = currentUser.id`; create assigns that link server-side. Admin vehicle reads are unscoped. |
| Applications | Citizen queries use `citizenId = currentUser.id`, including public-reference lookup. Admin workflows load globally but validate transition rules. |
| Documents/files | Resolve document through an owned application and `isCurrent = true` for citizens; admins may access version history. Authorize before obtaining a file stream. |
| Appointments | Resolve appointment through an owned application for citizens; validate scheduled/status/start-time rules in scheduling service. |
| Payments, inspections, stickers | Citizen access resolves through owned application. Admin mutations separately validate payment/appointment/inspection consistency. |
| Notifications | Query `recipientUserId = currentUser.id`; mark-read is scoped by the same condition. |
| Timeline | Query owned application plus `visibleToCitizen = true` for citizens. |
| Audit logs | ADMIN only; never expose a citizen route. |

Avoid one ownership guard per endpoint. Use named policy functions such as `assertApplicationOwned`, `assertVehicleOwned`, or query methods that return only scoped resources. A policy may be shared inside related modules; it should not become a generic reflection-based authorization framework.

## 9. Transaction design

Use `DataSource.transaction(async (manager) => ...)` for normal multi-row operations. Use an explicit `QueryRunner` only when a named isolation/locking need cannot be expressed clearly through that callback. Each participating domain service accepts the transaction `EntityManager` (or a transaction-scoped repository derived from it), so timeline, notification, audit, and main data writes commit or roll back together. No distributed transaction or external event bus is needed.

| Transactional endpoint/operation (27) | Lock/check pattern and atomic effects |
| --- | --- |
| 1. Register | Check normalized phone/email unique constraints; create user/profile/hashed registration code. |
| 2. Verify account | Lock eligible registration code/user; consume code, update verified time/status, create one refresh session, and issue the response/cookie after commit. |
| 3. Login | Verify normalized credentials and `ACTIVE` status; update `lastLoginAt` and create one refresh session atomically. |
| 4. Refresh | Lock session by signed session ID; verify signature/user/hash/fixed expiry/revocation; rotate its hash and usage state without extending expiry. Reuse revokes that session. |
| 5. Logout | Revoke only the matching current session when valid and clear the cookie in all cases without disclosure. |
| 6. Reset-password confirm | Lock eligible reset code/user; replace hash, consume code, and revoke all active sessions. |
| 7. Admin user status | Lock user; allow only `ACTIVE`/`DISABLED`; disabling revokes all active sessions plus audit, activating restores none. |
| 8. Submit application | Lock/read owned vehicle; rely on `uq_active_application_per_vehicle`; create application/snapshots/three documents/timeline/notification/audit. |
| 9. Resubmit correction | Lock application/current documents; flip prior `isCurrent`, insert versions, rely on `uq_current_document_per_type`, create correction timeline/audit only. |
| 10. Citizen application cancel | Lock application/payment/inspection and any scheduled appointment; cancel appointment and release capacity if present, then application effects. |
| 11. Admin application cancel | Same cancellation coordination; when payment is confirmed, retain it unchanged without refund/reversal. |
| 12. Start review | Lock application; validate `SUBMITTED`; set review fields/timeline/notification/audit. |
| 13. Request correction | Lock application/documents; validate review state/reason; transition with approved effects. |
| 14. Mark ready | Lock application/current docs; validate all three approved; transition with approved effects. |
| 15. Review document | Lock current document; validate status/rejection reason; update review data and audit. |
| 16. Book appointment | Lock slot or use equivalent safe protection; verify `OPEN`, count `SCHEDULED`, enforce capacity and `uq_scheduled_appointment_per_application`; create appointment/payment-if-absent/timeline/notification/audit. |
| 17. Citizen appointment cancel | Lock appointment; verify ownership, scheduled status, and start time; cancel with effects. |
| 18. Reschedule appointment | Lock current appointment and target slot; cancel old and create new in one transaction, never update `slotId`. |
| 19. Admin appointment cancel | Lock scheduled appointment; require operational reason; cancel with effects. |
| 20. Mark no-show | Lock eligible scheduled appointment; confirm no inspection; mark `NO_SHOW` with effects. |
| 21. Confirm payment | Lock `PENDING`/`REJECTED` pay-at-station payment; ensure receipt uniqueness; preserve rejection fields; confirm/timeline/notification/audit. |
| 22. Reject payment | Lock `PENDING` pay-at-station payment; set rejection fields and audit only, with no payment-failed timeline/notification. |
| 23. Create inspection | Lock/read appointment/application/payment; validate composite consistency, confirmed payment, and one inspection per appointment. |
| 24. Complete inspection | Lock pending inspection/appointment/application; complete appointment in same transaction; PASS creates/retains sticker, FAIL terminalizes application; write approved effects. |
| 25. Mark sticker ready | Lock eligible sticker/application; record ready state/actor/time and approved effects. |
| 26. Issue sticker | Lock sticker/application/inspection; require completed PASS; issue sticker and complete application atomically. |
| 27. Announce | Select active citizens and insert one `IN_APP`/`SYSTEM_ANNOUNCEMENT` notification per recipient plus audit in one transaction. |

For expected unique races, catch/translate the named PostgreSQL constraint/index violation to the approved error code after the transaction rolls back. Do not treat database error text as an API response.

## 10. Application workflow design

Workflow validation belongs in explicit `ApplicationsService` methods and collaborating inspection/sticker operations, not in a generic `updateStatus` endpoint/service.

| Approved transition | Owning explicit method | Initiator |
| --- | --- | --- |
| New request -> `SUBMITTED` | `submit` | Application submission |
| `SUBMITTED` -> `UNDER_REVIEW` | `startReview` | Admin application action |
| `UNDER_REVIEW` -> `CORRECTION_REQUIRED` | `requestCorrection` | Admin application action |
| `CORRECTION_REQUIRED` -> `SUBMITTED` | `resubmitCorrection` | Citizen document replacement |
| `UNDER_REVIEW` -> `READY_FOR_INSPECTION` | `markReadyForInspection` | Admin application action |
| `READY_FOR_INSPECTION` -> `INSPECTION_FAILED` | `completeFailedInspection` | Called by inspection completion, not a generic application route |
| `READY_FOR_INSPECTION` -> `COMPLETED` | `completeAfterStickerIssue` | Called by sticker issuance after a completed `PASS` inspection and an `ISSUED` sticker, not a generic application route |
| Eligible non-final -> `CANCELLED` | `cancel` | Citizen/admin cancellation with different preconditions |

The application remains `READY_FOR_INSPECTION` through appointment booking, payment confirmation, inspection `PASS`, sticker preparation, and sticker issuance. Application completion occurs only after sticker issuance; `COMPLETED` is unreachable from every other non-final status. Each method loads the application in the transaction, checks exact source state and actor rules, makes only the named target change, and calls side-effect services with the same manager. `INSPECTION_FAILED`, `COMPLETED`, and `CANCELLED` remain terminal. No reinspection, reopening, generic status-update route, arbitrary status PATCH, or reverse transition is planned.

## 11. Side-effect coordination

`ActivityModule` should expose focused `TimelineService` and `AuditService`; `NotificationsModule` should expose `NotificationService`. The caller remains the transaction owner and passes its `EntityManager` to these services. This retains clear, synchronous effects without external events, queues, or event sourcing.

| Action | Timeline | Citizen notification | Audit |
| --- | --- | --- | --- |
| Submission/review/correction request/ready | Approved matching event | Approved matching type | Yes |
| Correction resubmission | `CORRECTION_RESUBMITTED` | **None**; no approved type | Yes |
| Booking/cancellation/no-show | Approved matching event | Approved matching type | Yes |
| Payment confirmation | `PAYMENT_CONFIRMED` | `PAYMENT_CONFIRMED` | Yes |
| Rejected manual payment | **None** | **None** | Yes |
| Inspection pass/fail | Approved matching event | Approved matching type | Yes |
| Sticker ready | `STICKER_READY` | `STICKER_READY` | Yes |
| Sticker issuance | `STICKER_ISSUED` | **None** for issuance itself; application completion has its approved notification | Yes |
| Application cancellation | `APPLICATION_CANCELLED`; appointment event if applicable | Matching approved types | Yes |
| System announcement | Not an application timeline item | one `SYSTEM_ANNOUNCEMENT` per active citizen | Yes |

Audit serializers must redact password/code/token/private-storage data before persistence as well as before response mapping.

## 12. File upload and storage plan

`FilesModule` should define a minimal provider-neutral interface, for example `save(upload)`, `openReadStream(storageKey)`, and `delete(storageKey)` for cleanup. The first implementation may be local-development filesystem storage; no cloud provider is selected in this plan. PostgreSQL stores only existing metadata/keys, not file binaries.

Application submission and correction services own document metadata/version rows. Their flow is: validate field name/MIME/size/filename, store a temporary or final object, create entity rows in the transaction, and delete temporary/final objects if the database transaction fails. Replacement creates a new document version; it never overwrites existing content. Exact MIME list and size maximums come from configuration constants before implementation.

For first-release application-document and sticker-certificate access, authorize the caller before opening any file stream. These are the only approved first-release binary routes. Profile-image upload/download and invoice/receipt file access have no approved first-release routes and remain deferred. Never reveal storage keys, `profileImageKey`, certificate storage keys, internal filesystem paths, or provider-specific paths.

## 13. Response mapping and errors

Each feature mapper converts entities/projections to Task 4B response models. Mapper input is explicitly loaded with only relations needed by the endpoint. Examples: `UserMapper` returns safe `UserSummary`; `CitizenProfileMapper` uses `nationalIdNumber` and an authorized `profileImageUrl`/availability rather than `profileImageKey`; `VehicleMapper` uses `linkedCitizenId`; application mapper exposes `referenceNumber`; auth mapper exposes the approved access-token response fields for login, verification, and refresh without any refresh credential/session fields.

Collections map to `data` plus `PaginationMeta`; mappers calculate `totalPages` from the same validated query. Controllers return mapped objects/envelopes, never entity instances.

`DomainException` plus one global filter maps the 55 approved codes to stable HTTP responses. Validation errors provide safe field details. TypeORM unique/check/foreign-key errors are translated by known constraint context where possible; unexpected errors are logged with request context and returned only as `INTERNAL_SERVER_ERROR` without SQL text or stack trace.

Required mapping remains: invalid credentials/JWT -> 401; inactive/disabled accounts -> 403; ownership/role -> 403; validation -> 400; workflow/capacity/uniqueness state conflict -> 409. Logs must exclude passwords, hashes, verification/development codes, JWTs, and private storage information.

## 14. Testing strategy

Keep tests layered and targeted:

- **Unit tests:** pure mappers, normalization, state predicates, number generation, and small policy helpers where behavior is nontrivial.
- **Service workflow tests:** mocked repositories/transaction manager for auth, all eight application transitions, payment retry, scheduling rules, inspection/sticker orchestration, and required side-effect calls.
- **Authorization tests:** citizen ownership isolation for every owned domain and active/disabled/role enforcement.
- **PostgreSQL integration tests:** use a dedicated isolated test database, apply migrations, and test real partial indexes/checks/composite foreign key/row locks. Never run development migration commands against it by accident.
- **REST e2e tests:** Build from the existing foundation e2e coverage for the global prefix, validation, and exception filter; add focused authenticated and essential-flow tests as features are implemented.

Priority scenarios are verification/login session creation; refresh rotation with fixed expiry; rotated-token reuse revoking only its session; idempotent logout; password-reset and account-disable all-session revocation; protected active-user checks; cross-citizen access denial; all eight transitions; document replacement history/current uniqueness; slot-capacity concurrency; one scheduled appointment; `REJECTED` to `CONFIRMED` payment retry; confirmed-payment cancellation retention; inspection-driven appointment completion; failed-inspection terminal behavior; sticker issuance/application completion; and atomic timeline/notification/audit results. Do not require a test for every trivial mapper.

## 15. Implementation sequence

| Phase | Modules and essential endpoints | Prerequisites / principal tests / done definition |
| --- | --- | --- |
| 1. Common foundation — Task 6A (completed) | Config, Database, Common; API prefix, pipe, envelopes, error filter, request context, transaction convention. | Completed: configuration validation/error/pagination foundation tests pass and no feature endpoint bypasses these conventions. |
| 2. Authentication and users | Auth, Users; eight auth routes (including refresh/logout), current user, citizen-profile patch, admin user reads/status; controlled bootstrap. | Approve `@nestjs/jwt`, Argon2id, and minimal cookie parsing support if needed; test session rotation/fixed expiry/revocation/active-user behavior; done when protected identity is reliable. |
| 3. Vehicles | Vehicles; citizen create/list/detail and admin list/detail. | Phase 2 actor context; ownership/uniqueness tests; done when vehicle scope and mappings match contract. |
| 4. Applications and documents | Applications, Files, Activity, Notifications; submission, reads, review/correction/ready/cancel, document list/detail/download/review, timeline. | Phases 1-3, upload constants; transaction/version/current-visibility/cancellation tests; done when all six phase-owned application transitions and the document workflow work atomically. The remaining two approved transitions occur later: `READY_FOR_INSPECTION` -> `INSPECTION_FAILED` during inspection completion, and `READY_FOR_INSPECTION` -> `COMPLETED` during sticker issuance. |
| 5. Stations and scheduling | Scheduling plus Payments/Activity/Notifications collaborators; stations, slots, booking/cancel/reschedule/no-show. | Ready applications; PostgreSQL locking/capacity tests; done when schedule history/capacity are correct. |
| 6. Payments | Payments with Scheduling/Applications collaborators; citizen payment read, admin list/detail/confirm/reject. | Booking creates payment; retry/rejection/confirmed-retention tests; done when no duplicate payment or forbidden transition occurs. |
| 7. Inspections | Inspections with Scheduling, Payments, Applications, Stickers, side effects; create/complete/admin reads/citizen reads. | Confirmed payment and composite FK; pass/fail and appointment-completion tests; done when failure transition is terminal. |
| 8. Stickers | Stickers, Files, Applications, side effects; ready, issue, citizen sticker/certificate read. | Completed PASS inspection; issuance/application-completion tests; done when certificate authorization and workflow effects work. |
| 9. Notifications and audit | Notifications, Activity; citizen reads/read actions, all-active announcement, admin audit list/detail. | Prior workflow effects; isolation/redaction/announcement atomicity tests; done when all reads are scoped. |
| 10. Optional convenience | Applications, Notifications, Activity, Admin dashboard; reference lookup, notification detail, audit detail, dashboard summary. | Essential endpoints stable; focused read-only tests; done when optional routes add no workflow/schema behavior. |

Do not attempt all 77 endpoints in one implementation task. A phase is complete only when its endpoint contract, authorization, mapper, error behavior, focused tests, and relevant transaction behavior pass.

## 16. Dependency and circular-dependency rules

Allowed runtime dependencies remain NestJS, TypeORM, PostgreSQL driver, configuration, and explicit small libraries approved at the phase needing them. Candidate additions must directly support an approved requirement (JWT signing/verification, password hashing, DTO validation/transform, or multipart handling) and receive separate approval; no dependency is installed by Task 5A.

```text
AuthSessionPersistence (Auth-owned leaf) -> database
Auth -> Users, AuthSessionPersistence
Users -> AuthSessionPersistence
Applications -> Users, Vehicles, Files, Activity, Notifications
Scheduling -> Applications, Payments, Activity, Notifications
Inspections -> Scheduling, Applications, Payments, Stickers, Activity, Notifications
Stickers -> Applications, Files, Activity, Notifications
Admin -> read-only feature service/query interfaces
Activity/Notifications/Files -> common/database only (not back to business modules)
```

Avoid cycles by making the module that owns the user action orchestrate collaborators, exporting only narrow services needed by another module, passing transaction-aware side-effect services downward, and sharing only types/errors in `common` when genuinely shared. `RefreshSessionRevocationService` is Auth-owned but belongs in an Auth-owned leaf persistence module that depends only on database entities; `UsersModule` calls that narrow service inside its status transaction, while `AuthModule` may depend on `UsersModule` for login/verification orchestration. This prevents an `AuthModule`/`UsersModule` import cycle. `StickersModule` must not import `InspectionsModule`: inspection completion may call an exported narrow sticker-workflow service to create or retain the `NOT_READY` sticker, while sticker readiness/issuance validates a completed `PASS` inspection through a narrow read-only query or repository access without importing the whole inspections module. The orchestration owner determines dependency direction. Do not use `forwardRef` for this design.

## 17. Expected environment configuration

The environment validator and `.env.example` now contain the approved configuration. `.env` remains ignored and must contain real deployment/local secrets only.

| Category | Placeholder variables |
| --- | --- |
| Application | `NODE_ENV`, `PORT`, `API_PREFIX=/api/v1` |
| PostgreSQL | `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_LOGGING` |
| Access/refresh JWT | `JWT_ACCESS_SECRET=<replace-with-a-long-random-secret>`, `JWT_ACCESS_EXPIRES_IN=30m`, `JWT_REFRESH_SECRET=<replace-with-a-different-long-random-secret>`, `JWT_REFRESH_EXPIRES_IN=7d` |
| Refresh cookie | `REFRESH_COOKIE_NAME=mpwt_refresh`, `REFRESH_COOKIE_SECURE=false`, `REFRESH_COOKIE_SAME_SITE=lax`; HttpOnly is fixed in code and its auth path derives from `API_PREFIX`. Separate non-placeholder secrets are required, must differ, and cookie Secure must be true in production. |
| Password hashing | Argon2id parameters are implementation constants selected with the approved `argon2` package; do not introduce unapproved environment knobs first. |
| Verification | `VERIFICATION_CODE_TTL_SECONDS`, `VERIFICATION_CODE_MAX_ATTEMPTS`, `EXPOSE_DEVELOPMENT_VERIFICATION_CODE=false` |
| Files | `FILE_STORAGE_ROOT=<local-development-path>`, `MAX_UPLOAD_BYTES`, approved MIME configuration |
| Bootstrap | `ADMIN_BOOTSTRAP_*` placeholders only if an explicit bootstrap command requires them |

`.env.example` contains non-secret placeholders; Docker/pgAdmin development values are not production credentials. Do not add a frontend URL until the government-portal origin is confirmed.

## 18. Deferred frontend integration

Frontend implementation begins after this structure plan and the initial backend modules are approved. The existing Vue government portal remains the host application; the vehicle-inspection citizen workflow enters from its designated service card. Task 5A does not modify the Vue project.

Future integration needs only: configured API base URL, access-token handling, citizen/admin route separation, approved success/error responses, multipart upload, Khmer/English presentation, and preservation of the existing government-portal layout. Existing frontend Keycloak settings do not override backend JWT requirements.

## 19. Non-goals

This planning update does not implement controllers, services, DTO classes, guards, JWT issuance, refresh rotation, hashing, cookie middleware, feature endpoints, frontend code, or package installation. It adds only the approved entity/migration/configuration/documentation foundation and does not stage or commit files.

## 20. Decisions and readiness

There are no blocking architecture decisions for this documentation plan. Non-blocking items already identified by Task 4A/4B remain implementation constants: number formats, file MIME/size limits, password/Argon2id parameters, JWT key-rotation procedure, storage provider/key format, notification wording, audit redaction/retention details, exceptional administrative correction procedure, and the local-development verification-code exposure choice. The session-bound access-token claim set and lifetime, fixed refresh expiry, cookie protections, session-revocation rules, and no-Passport decision are approved.

This document remains the implementation plan for the remaining phases. Task
6A common-foundation work is complete; Task 6B authentication/users work has
not started and begins only after its approved dependency choice and safe
environment placeholders are confirmed.
