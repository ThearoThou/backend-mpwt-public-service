# Scheduling implementation

## Implementation history

### Phase 4 — daily-capacity scheduling

Scheduling currently implements a preferred station/date selection followed by
possible reservation for a renewal application. It is not a new citizen
hourly-slot booking system. The
public route details are in [`docs/api/02-rest-api-contracts.md`](../api/02-rest-api-contracts.md);
this document describes the service and transaction design.

## Scope and locked behavior

### Phase 6 inspection replacement

Replacement/reinspection is daily-capacity only; legacy `slot_id` appointments
are outside this MVP. After Attempt 1 FAIL, selected reinspection date must be
after Cambodia today and no later than the original FAIL deadline. After first
NO_SHOW, the citizen must book by its deadline, but the selected future date is
not capped by that booking deadline. `capacityDate` remains `YYYY-MM-DD`; the
atomic reservation query returns `capacity."capacity_date"::text`.

Replacement uses the existing CONFIRMED payment and creates no new payment.
Any active station with future, open, non-full capacity is eligible. The atomic
reservation rejects an existing SCHEDULED appointment. NO_SHOW does not release
the original capacity and a failed duplicate booking cannot increment it again.
Attempt 2 must complete by the original Attempt-1-FAIL deadline; a NO_SHOW after
that FAIL does not change it.

`inspection_stations` remains the station record. Phase 4 adds one
`inspection_station_daily_capacities` row per station/date, with positive
`daily_capacity`, integer `reserved_count`, and `is_closed`. The station/date
pair is unique and the database requires `0 <= reserved_count <= daily_capacity`.

`reserved_count` represents consumed units; it is not recalculated from the
currently SCHEDULED appointment rows. A `COMPLETED` or `NO_SHOW` appointment
does not release consumed capacity. There is no counter-reconciliation trigger
or generic reconciliation job.

### Normal-renewal preferred inspection date

For normal renewal Step 2, a preferred date is not an appointment or a
reservation. `PREFERRED_SCHEDULING_WINDOW_DAYS` defaults to 60 and defines the
inclusive Cambodia-local range from tomorrow through today plus that many
calendar days. A preferred date requires an active station, a Monday-Friday
date in that range, and no explicit closed daily-capacity row for that
station/date. It does not require a capacity row and a full-but-open date is
still a valid preference.

The 60-day normal-renewal preference window is an MVP/project assumption, not
a confirmed official MPWT scheduling limit. It must be confirmed and configured
for a production MPWT deployment. An explicit `is_closed=true` capacity row is
an operational closure override; it is not an official holiday calendar.

### Confirmed appointment date

A date is reservable only when all of these are true:

- the station is active;
- capacity date is after Cambodia local today;
- the daily row is not closed; and
- `reserved_count < daily_capacity`.

Closing capacity prevents new reservations but leaves existing reservations and
appointments intact. An admin may change the total only to a positive integer
that is not below the concurrently stored `reserved_count`; admins do not set
that counter directly.

## Components

| Component                               | Current responsibility                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `CitizenSchedulingAvailabilityService`  | Lists active stations, lists selectable dates, and validates a selection using active/future/open/non-full predicates. |
| `CitizenPreferredSchedulingService`     | Generates and validates normal-renewal preferred weekdays within the configured window, excluding explicit closures.     |
| `InspectionStationDailyCapacityService` | Admin daily-capacity list/get/create/update/close/reopen work and the internal atomic reservation update.              |
| `CitizenSchedulingPreferenceService`    | Saves a DRAFT preference and owns citizen recovery reservation from `APPOINTMENT_SELECTION_REQUIRED`.                  |
| `ApplicationWorkflowService`            | Requires and revalidates a DRAFT preference during submission without reserving it.                                    |
| `AdminApplicationReviewService`         | Owns review-pass orchestration: reservation outcome, appointment creation, application status, and status history.     |
| `PaymentsService`                       | Is invoked after successful scheduling commits; initialization failures are isolated from scheduling.                  |
| `StationsController`                    | Citizen station and available-date discovery.                                                                          |
| `AdminSchedulingController`             | ADMIN daily-capacity management routes.                                                                                |

The applications domain documents its DRAFT/submission/review responsibilities
in [Applications](04-applications.md).

## Preference and availability flow

A citizen may save `{ stationId, capacityDate }` only while their application
is `DRAFT`. The station/date DTO requires UUID v4 and a date-only `YYYY-MM-DD`
value. Saving validates the normal-renewal preferred-date rule and writes the
paired application fields, but creates no appointment, changes no counter, and
does not guarantee the requested date.

Submission requires those paired preference fields and revalidates them inside
the application transaction. Submission still does not reserve capacity. This
keeps a selected date from being treated as a booking before review succeeds.

The citizen discovery service returns active stations sorted by code/ID. A
station that is absent or inactive is not selectable.

`GET /stations` returns only active station `id`, `code`, `nameKh`, `nameEn`,
`province`, `address`, and nullable `phone` fields. It does not expose station
activity flags or capacity data. `GET /stations/:stationId/preferred-dates`
returns generated normal-renewal preference dates as `{ stationId,
capacityDate }` without capacity counts. `GET /stations/:stationId/available-dates`
continues to return only capacity-reservable dates for appointment flows.
`capacityDate` is always a Cambodia-local, date-only `YYYY-MM-DD` value, never
a UTC timestamp. Submission revalidates the saved preference because it is not
a reservation.

## Reservation transaction and concurrency

Review-pass and citizen recovery lock the application with a pessimistic write
lock. Capacity is reserved with one conditional PostgreSQL update in the same
transaction:

```sql
UPDATE inspection_station_daily_capacities AS capacity
SET reserved_count = capacity.reserved_count + 1,
    updated_at = now()
FROM inspection_stations AS station
WHERE capacity.station_id = :stationId
  AND capacity.capacity_date = :capacityDate
  AND station.id = capacity.station_id
  AND station.is_active = true
  AND capacity.capacity_date > ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)
  AND capacity.is_closed = false
  AND capacity.reserved_count < capacity.daily_capacity
RETURNING capacity.id;
```

The returned row proves the capacity existed and satisfied the predicate at the
write. The row update serializes concurrent reservations; no separate station
`FOR UPDATE` lock is used because station activity is revalidated in the same
write and the reservation does not modify the station row.

The admin total-capacity update is also guarded in SQL with
`new_daily_capacity >= reserved_count`, so a concurrent reservation cannot be
lost between validation and update. A later failure during appointment,
application, or history persistence rolls back the earlier counter increment.

## Review-pass outcomes

`POST /admin/applications/:applicationId/review-pass` is valid only from
`UNDER_REVIEW` with stored paired preference fields.

### Reservable preference

One transaction:

1. conditionally increments the selected daily capacity;
2. creates exactly one `SCHEDULED` appointment;
3. sets `slot_id` to null and connects `daily_capacity_id`;
4. changes the application `UNDER_REVIEW → APPROVED`; and
5. appends the matching immutable status-history row.

Repeating review-pass after this success is an invalid application transition,
so it cannot reserve twice.

Only after this transaction commits does review-pass attempt idempotent payment
initialization. The attempt is deliberately outside scheduling: a payment
failure leaves the approved application, appointment, and incremented capacity
committed. Payment rules are documented in [Payments](06-payments.md).

### Unavailable preference

When the conditional update returns no row—missing, inactive, non-future,
closed, or full capacity—the same review transaction instead changes
`UNDER_REVIEW → APPOINTMENT_SELECTION_REQUIRED` and appends history. It does
not create an appointment or modify `reserved_count`.

## Citizen appointment-selection recovery

An owning citizen in `APPOINTMENT_SELECTION_REQUIRED` submits a new station/date
selection. In one transaction the service locks the application, conditionally
reserves the selected row, creates the daily-capacity `SCHEDULED` appointment,
updates both preference fields, changes the application to `APPROVED`, and
appends history. A capacity that ceased to be selectable produces no partial
writes. After this scheduling transaction commits, it makes the same isolated
payment-initialization attempt.

## Appointment compatibility

Legacy `appointment_slots` remains in the executed schema. Migration 9 makes
`appointments.slot_id` nullable and adds nullable `daily_capacity_id` with a
database XOR check:

- legacy appointment: non-null `slot_id`, null `daily_capacity_id`;
- Phase 4 appointment: null `slot_id`, non-null `daily_capacity_id`.

The existing appointment status enum, `SCHEDULED` status, partial unique
scheduled-appointment-per-application index, composite appointment/application
identity, and inspection composite foreign key remain intact. Phase 4 does not
add a `RESERVED` status or replace legacy rows.

## Database and test evidence

Migration `1786422084518-AddDailyInspectionStationCapacities` created the
daily-capacity table, preference columns/pair check/index, daily appointment
source/FK/index, and compatibility XOR. The authoritative schema details are
in [`docs/database`](../database/).

Coverage includes entity metadata tests, daily-capacity service tests,
availability and preference tests, application workflow integration tests, and
real PostgreSQL tests in `test/phase4g-review-pass-rollback.e2e-spec.ts` and
`test/phase4j-http.e2e-spec.ts`. The rollback tests force a failure after the
counter increment and verify no counter change, no approved status, no
SCHEDULED appointment, and no corresponding status-history row survive.

Manual HTTP/Postman verification covers DRAFT preference without reservation,
submission without reservation, start-review, successful review-pass, repeated
review-pass rejection, closed-capacity fallback, citizen recovery selection,
and closure without release of an existing reservation.

## Local development Step 2 fixtures

`npm run seed:local-inspection-stations` is an opt-in local-development seed.
It requires `NODE_ENV=development` and
`ALLOW_LOCAL_STATION_CAPACITY_SEED=true`; it is never run by application
startup or migrations. The script uses the validated data source, writes inside
one transaction, prints the target database/host, and treats an existing
station/date pair with different data as a conflict rather than updating it.
For the six exact known legacy fixture rows only, it can migrate the former
`DEV-PP-*` code to its matching `PP-*` code in place; any conflicting or
unexpected station data aborts without a write. A code-migration run skips all
capacity writes for the migrated station, so existing capacity data remains
unchanged.

The six station location descriptors and Khmer wording are taken from MPWT's
[Technical Inspection page](https://www.mpwt.gov.kh/en/public-services/technical-inspection).
The `PP-RUSSEY-KEO`, `PP-NR6A`, `PP-MONG-RETHY`, `PP-CHAMKAR-DOUNG`,
`PP-VEAL-SBOV`, and `PP-KAMBOL` codes are internal project fixtures, not
confirmed official MPWT station codes. The source lists the
general support hotline (1275), but no station-specific phone numbers; fixture
station `phone` values are therefore `null`.

Daily-capacity totals, reserved counts, and the simulated closed date are
development test data only. The seed selects future Cambodia-local weekdays at
runtime, leaves intervening dates unconfigured, and does not introduce a
weekend rule or an official holiday calendar. The preferred-date endpoint
generates its own weekday candidates and treats only `is_closed=true` as an
explicit closure override; the capacity endpoint remains reservable-only.

## Not implemented

There is no scheduling implementation for appointment retrieval, cancellation,
rescheduling, daily-capacity decrement/release, hourly citizen slot selection,
or notification delivery. Physical inspection and replacement/reinspection use
the Phase 6 daily-capacity behavior described above. Payment initialization is
implemented only as the post-commit integration described above; its
calculation, status, document, and HTTP rules are in [Payments](06-payments.md).
