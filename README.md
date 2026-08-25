# MPWT Vehicle Inspection Renewal Service — backend

NestJS, PostgreSQL, and TypeORM backend for the MPWT vehicle inspection renewal
service, including the Phase 5 payment workflow and PDF payment documents.

## Current implemented scope

The backend currently includes authentication/session security, users and
citizen profiles, citizen/admin vehicle workflows, inspection-vehicle
categories, persisted renewal-application DRAFTs and documents, application
review operations, and Phase 4 daily station/date capacity scheduling.

The Phase 4 scheduling path is:

1. a citizen creates a DRAFT, uploads required documents, and saves a preferred
   active station and preferred weekday/date within the configured window;
2. submission validates the preference but does not reserve it;
3. admin review-pass atomically reserves the preferred capacity and approves,
   or moves the application to `APPOINTMENT_SELECTION_REQUIRED` without a
   reservation;
4. the citizen may select another available date to reserve and reach
   `APPROVED`; and
5. after the scheduling transaction commits, payment initialization is attempted
   without rolling back scheduling when it fails.

Legacy `appointment_slots` remains compatible with existing appointments, but
the Phase 4 citizen flow is daily capacity rather than new hourly slot
selection. Payment is implemented for the `PAY_AT_STATION` MVP; inspections,
stickers, appointment management, and rescheduling remain outside the current
HTTP workflow.

See:

- [workflow and permissions](docs/api/01-users-workflow-and-permissions.md)
- [implemented REST contracts](docs/api/02-rest-api-contracts.md)
- [Scheduling implementation](docs/implementation/05-scheduling.md)
- [Payment workflow implementation](docs/implementation/06-payments.md)

## Setup

1. Copy `.env.example` to `.env`.
2. Set local PostgreSQL credentials and create the configured database.
3. Install dependencies with `npm install`.
4. Apply the TypeORM migrations before starting the service.

TypeORM synchronization is disabled. The repository currently contains ten
migrations, including Migration 9 for inspection-station daily capacities and
appointment compatibility and Migration 10 for payment workflow snapshots and
payment status history. Migration 10 refuses to run if `payments` already has
rows, because those rows cannot safely receive its required snapshots.

```bash
npm run migration:show
npm run migration:run
npm run migration:revert
```

The default API prefix is `/api`; configure it with `API_PREFIX`.

## Run

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

## Test

```bash
# unit tests
npm test

# guarded PostgreSQL e2e tests (uses the dedicated db-e2e database only)
npm run test:e2e

# build
npm run build
```

E2E tests require the dedicated `db-e2e` service and exact
`mpwt_vehicle_inspection_renewal_e2e` database-name safety guards. Jest runs
them with one worker because they perform broad fixture cleanup. `.env.e2e` and
`.env.e2e.example` are intentionally not tracked; never point E2E execution at
the development database.

Payment PDFs are rendered with Puppeteer/managed Chromium and the bundled Khmer
font, so deployment must provide the managed Chromium runtime. Do not commit
`.env` or real credentials.
