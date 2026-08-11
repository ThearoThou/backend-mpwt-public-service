# MPWT Vehicle Inspection Renewal Service — backend

NestJS, PostgreSQL, and TypeORM backend for the MPWT vehicle inspection renewal
service.

## Current implemented scope

The backend currently includes authentication/session security, users and
citizen profiles, citizen/admin vehicle workflows, inspection-vehicle
categories, persisted renewal-application DRAFTs and documents, application
review operations, and Phase 4 daily station/date capacity scheduling.

The Phase 4 scheduling path is:

1. a citizen creates a DRAFT, uploads required documents, and saves a preferred
   active station and future selectable date;
2. submission validates the preference but does not reserve it;
3. admin review-pass atomically reserves the preferred capacity and approves,
   or moves the application to `APPOINTMENT_SELECTION_REQUIRED` without a
   reservation;
4. the citizen may select another available date to reserve and reach
   `APPROVED`.

Legacy `appointment_slots` remains compatible with existing appointments, but
the Phase 4 citizen flow is daily capacity rather than new hourly slot
selection. Payment, inspection, sticker, appointment management, and
rescheduling endpoints are not currently implemented.

See:

- [workflow and permissions](docs/api/01-users-workflow-and-permissions.md)
- [implemented REST contracts](docs/api/02-rest-api-contracts.md)
- [Scheduling implementation](docs/implementation/05-scheduling.md)

## Setup

1. Copy `.env.example` to `.env`.
2. Set local PostgreSQL credentials and create the configured database.
3. Install dependencies with `npm install`.
4. Apply the TypeORM migrations before starting the service.

TypeORM synchronization is disabled. The repository currently contains nine
migrations, including Migration 9 for inspection-station daily capacities and
appointment compatibility.

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

# e2e tests
npm run test:e2e

# build
npm run build
```

Do not commit `.env` or real credentials.
