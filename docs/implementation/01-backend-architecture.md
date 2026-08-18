# Backend architecture

## Overview

The service is a NestJS modular monolith backed by PostgreSQL and TypeORM. One
Nest application exposes the HTTP API and one PostgreSQL database holds the
service records. Modules own cohesive domain operations while sharing a small
HTTP/auth/error foundation; the project does not use microservices, a message
broker, GraphQL, or a generic repository layer.

The application applies the configurable global API prefix (default `/api`) in
`configureApiApplication`. That composition also installs the global
`ValidationPipe` and the safe exception filter. Successful controller results
use `{ data }` or `{ data, meta }`; errors use a stable envelope with an HTTP
status, domain code, message, timestamp, and path.

PostgreSQL schema changes are migration-based. TypeORM synchronization,
automatic schema drops, and automatic migration execution are disabled. The
current entity registry contains 21 entities and the repository contains twelve
migrations. The cumulative executed schema is documented in
[`docs/database`](../database/).

## Runtime composition

### Phase 6 inspections

`InspectionsModule` owns `AdminInspectionsController`,
`CitizenApplicationInspectionsController`, `CitizenInspectionsController`,
`InspectionReadsService`, `InspectionCommandsService`,
`InspectionReplacementSchedulingService`, `InspectionExpiryService`, and
`InspectionWorkflowScheduler`. Services use TypeORM entities/DataSource directly
and replacement reservation depends on the daily-capacity scheduling service;
there is no ApplicationsModule/PaymentsModule domain import cycle.

`ScheduleModule.forRoot()` is configured once in `AppModule`. The hourly
scheduler delegates only to `InspectionExpiryService.processDueActions()`, with
an in-process busy guard and caught/logged errors. There is no distributed lock
or multi-instance coordination; this is a single-process internship MVP.

`AppModule` composes configuration, database, common foundation, auth, users,
vehicles, inspection categories, applications, scheduling, files, and the
foundation modules for payments, inspections, stickers, notifications,
activity, and admin features. Payments, inspections, and sticker issuance have
implemented MVP workflows. Notification/activity viewer, reporting, dashboard,
and other admin capabilities are only foundations unless a controller/service
explicitly implements a listed behavior.

| Area                                             | Current responsibility                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `config`                                         | Validates environment configuration and supplies it application-wide.                                                                  |
| `database`                                       | Creates the TypeORM PostgreSQL connection from registered entities and migration configuration.                                        |
| `common/http` and `common/errors`                | API prefix, validation, response envelopes, `DomainException`, and safe exception mapping.                                             |
| `common/auth`                                    | Access-token guard, actor decorator, role metadata, and role guard.                                                                    |
| `auth`                                           | Registration, verification, login, token issuance, refresh rotation, logout, reset, refresh-session revocation, and admin bootstrap.   |
| `users`                                          | Users, citizen profiles, current-user/profile work, and admin user administration.                                                     |
| `vehicles` and `inspection-categories`           | Citizen/admin vehicle access, plate normalization, categories, and admin classification/history.                                       |
| `applications` and `files`                       | DRAFT lifecycle, document storage/versioning, submission, citizen reads, and admin review operations.                                  |
| `scheduling`                                     | Station/date availability, daily capacities, preference validation, and reservation primitives.                                        |
| `payments`                                       | Idempotent post-scheduling payment initialization, payment transitions/history, private PDF artifacts, and citizen/admin payment APIs. |
| `inspections`                                    | Physical inspection reads/commands, replacement booking, expiry processing, and the scheduler adapter.                                 |
| `stickers`                                      | Admin sticker issuance after a qualifying PASS inspection and citizen/admin sticker-status reads; pickup, certificate, stock, QR, and reissue lifecycle are not implemented. |
| `notifications`, `activity`, `admin`             | Schema/module foundations only, apart from the explicit admin operations and rejection/reopen audit writes implemented by their services. |

Detailed implementation notes are domain-oriented:

- [Authentication and users](02-authentication-and-users.md)
- [Vehicles](03-vehicles.md)
- [Applications](04-applications.md)
- [Scheduling](05-scheduling.md)
- [Payments](06-payments.md)

## HTTP, validation, and authorization

Controllers are deliberately thin: they accept a validated DTO, obtain the
authenticated actor where needed, call a named service operation, and return a
safe response shape. The global validation configuration whitelists DTO fields,
forbids unexpected fields, enables DTO transformation, and formats validation
errors through the shared error system.

`AccessTokenGuard` validates the signed session-bound access token and checks
that its user is active and its backing refresh session is still valid. The
roles guard applies broad `CITIZEN`/`ADMIN` boundaries from controller metadata.
Services then enforce record ownership and domain preconditions. A caller never
supplies a citizen ID to obtain ownership of a resource.

## Data and cross-domain relationships

The central relationships currently implemented are:

- a user may have a citizen profile, vehicles, refresh sessions, and renewal
  applications;
- a renewal application belongs to one citizen and one vehicle, keeps
  application/document/status history, and may store a preferred inspection
  station/date;
- application documents are versioned and their files are kept under the
  private file-storage root;
- an approved application with one scheduled appointment may have one Payment
  with immutable fee, expiry, and calculation snapshots plus payment-status
  history and private PDF artifact keys;
- a vehicle may be classified against one inspection vehicle category and has
  immutable classification history;
- a station owns legacy appointment slots and daily-capacity rows;
- an appointment has exactly one scheduling source: a legacy slot or a Phase 4
  daily-capacity row.

Database foreign keys, checks, unique indexes, partial unique indexes, and
immutable-history triggers protect row-level integrity. They do not replace
authorization or multi-row lifecycle orchestration.

## Transaction ownership

State-changing services use `DataSource.transaction` and pass the transaction
manager to nested operations when their writes must commit or roll back as one
unit. Examples include account verification/session creation, password-reset
session revocation, vehicle classification/history, application submission,
document replacement, review actions, and Phase 4 reservation orchestration.
Payment initialization begins only after the scheduling transaction commits, so
an initialization failure cannot roll back an approved application, appointment,
or capacity reservation. Payment status changes and their history writes share
their own transaction.

The service that owns a cross-domain transition owns the transaction. In
particular, admin review-pass coordinates the scheduling reservation,
appointment insert, application status transition, and status-history insert.
The scheduling capacity service provides an atomic reservation primitive; it
does not independently change application status.

## Current implementation status

Implemented through the current project stage:

- authentication, active-session security, user/profile management, and admin
  user status management;
- citizen/admin vehicles, inspection vehicle categories, and immutable vehicle
  classification history;
- persisted application DRAFTs, document upload/versioning, submission,
  citizen application reads/cancellation, and admin review operations;
- Phase 4 station/date scheduling with daily capacity, review-pass reservation,
  fallback selection, and real PostgreSQL rollback coverage.
- Phase 5 payment initialization, `PAY_AT_STATION` confirmation/rejection/
  reopen transitions, payment history, and private invoice/receipt/inspection
  sheet PDFs.
- Phase 6 physical inspection, replacement/reinspection booking, NO_SHOW and
  expiry processing; and Phase 7 sticker issuance after a completed PASS.

Not implemented as complete workflows: online payment providers,
notification delivery and reads, general appointment
retrieval/cancellation/rescheduling, daily-capacity release, certificate or
pickup workflow, sticker reissue/inventory/printing/QR lifecycle, dashboards,
reports, and exports. Their entities or controller shells do not make those
workflows current behavior.

## Testing approach

The repository combines focused unit tests with service integration tests and
real Nest/PostgreSQL e2e coverage. The Phase 4 rollback tests verify that a
reservation increment is rolled back when a later transactional write fails;
the HTTP tests verify the `/api` prefix, guards, roles, envelopes, DTO
validation, and real daily-capacity persistence. Phase 5 adds guarded real
PostgreSQL/API E2E, migration UP/DOWN/UP, rollback, Postman, and visual-PDF
verification. Domain documents describe their relevant test coverage; the REST
contract remains in `docs/api`.
