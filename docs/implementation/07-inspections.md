# Physical inspection implementation

## Purpose and MVP boundary

Phase 6 begins after an application is `APPROVED`, its payment is
`CONFIRMED`, and it has a daily-capacity appointment. It supports physical
inspection results, NO_SHOW handling, replacement/reinspection booking, and
automatic expiry. The maximum of two actual physical attempts is an internship
MVP rule, not verified official MPWT policy. There is no INSPECTOR role,
checklist, measurement, signature, or check-in flow.

## Actors and permissions

ADMIN views the queue/detail, records PASS/FAIL, and may manually mark an
eligible past appointment NO_SHOW. A citizen can read only their own status and
completed inspection history, view eligible availability, and book an eligible
replacement/reinspection; they cannot record a result or mark NO_SHOW. Automatic
processing is SYSTEM with a null actor, never a fake UUID.

## Inspection state model

An appointment has at most one inspection. An inspection is `PENDING` or
`COMPLETED`; a completed inspection has `PASS` or `FAIL`. `attemptNumber` is
only 1 or 2 and is unique per application. Completed inspections are immutable.
Reinspection deadlines and NO_SHOW counts are derived, not stored.

## Result eligibility

Recording requires an APPROVED application, CONFIRMED payment, SCHEDULED
daily-capacity appointment, Cambodia-local `capacityDate` equal to today, and
no inspection on that appointment. Legacy `slot_id` appointments are outside
the Phase 6 MVP.

## PASS and FAIL validation

PASS permits a null or omitted `failureReason`. FAIL requires a trimmed,
nonempty failure reason of at most 500 characters. PASS is workflow-final:
no state containing a completed PASS advertises a new Phase 6 action.

## Attempt outcomes

Attempt 1 PASS and Attempt 2 PASS leave the application APPROVED and make it
sticker eligible. Attempt 1 FAIL leaves it APPROVED and requires reinspection;
Phase 6 intentionally does not use `REINSPECTION_REQUIRED`. Attempt 2 FAIL
sets `INSPECTION_FAILED` with `SECOND_INSPECTION_FAILED`. `COMPLETED` remains
reserved for downstream sticker issuance.

## Admin inspection queue

PENDING contains APPROVED, CONFIRMED, SCHEDULED daily-capacity work with no
inspection, capacity date at least Cambodia today, no previous PASS, and at
most one previous FAIL. Upcoming work can be visible, but recording is allowed
only on its capacity date. PASSED and FAILED list completed corresponding
results.

## Citizen inspection status

Citizen status reports `attemptsUsed`, `attemptsRemaining`, the latest
appointment status, inspection summary, deadlines, replacement/reinspection
flags, and sticker eligibility. Reinspection/replacement actions are available
only while the application remains APPROVED; PASS finality is enforced
defensively.

## Citizen inspection history

Citizen history is paginated and contains only the citizen's completed physical
attempts. It includes application/reference, attempt, result, inspected time,
failure reason, station, and vehicle. It never exposes a recorder/admin ID;
NO_SHOW alone does not create an inspection-history row.

## NO_SHOW

An overdue SCHEDULED daily-capacity appointment without an inspection becomes
NO_SHOW. It records `no_show_marked_at`, is immutable, does not consume an
attempt, does not release capacity, and does not mutate the CONFIRMED payment.
Automatic processing uses null actor; ADMIN is the manual fallback.

## First-NO_SHOW replacement

A first NO_SHOW before a real FAIL leaves the application APPROVED and gives
the citizen 30 days from the missed capacity date to **book** a replacement.
The selected future appointment date itself is not capped by that booking
deadline. Booking expiry cancels the application with
`NO_SHOW_REBOOKING_DEADLINE_EXPIRED`.

## Reinspection after Attempt 1 FAIL

After Attempt 1 FAIL, any active station with valid future/open/non-full daily
capacity is eligible. The selected date must be after Cambodia-local today and
on or before the original FAIL date plus 30 calendar days. The same CONFIRMED
payment is reused and no new payment is created.

## Deadline and expiry behavior

Attempt 2 must complete by the same Attempt-1-FAIL deadline. Missing it changes
the still-APPROVED application to `INSPECTION_FAILED` with
`REINSPECTION_DEADLINE_EXPIRED`; no fake attempt is created.

## Precedence rules

A second NO_SHOW cancels immediately with `NO_SHOW_LIMIT_REACHED`, including
after Attempt 1 FAIL, and takes precedence over reinspection expiry.

## Automatic system processing

`InspectionExpiryService` processes overdue NO_SHOWs before booking and
reinspection expiry.

## Scheduler

`InspectionWorkflowScheduler` invokes `InspectionExpiryService` hourly through
`@nestjs/schedule`, delegates only to `processDueActions()`, uses an in-process
busy guard to skip overlap, and logs/catches unexpected errors so a later run
can continue. There is no distributed lock or multi-instance coordination in
this single-process internship deployment.

## Database invariants

Migration 11 adds `INSPECTION_FAILED`, the attempt check and unique
application/attempt constraint, result/failure-reason and state-consistency
checks, the completed-inspection immutability trigger
`trg_guard_completed_inspection_immutable`, and status-history
`reason varchar(100)`. Migration 11 is intentionally irreversible.

## API endpoints

ADMIN: `GET /admin/inspections`,
`GET /admin/inspections/appointments/:appointmentId`,
`POST /admin/inspections/appointments/:appointmentId/result`, and
`POST /admin/inspections/appointments/:appointmentId/no-show`.

CITIZEN: `GET /applications/:applicationId/inspection-status`, `GET /inspections`,
`GET /applications/:applicationId/replacement-inspection/stations/:stationId/available-dates`,
and `POST /applications/:applicationId/replacement-inspection/appointment`.

## Payment invariants

Replacement/reinspection reuses the existing CONFIRMED payment. Atomic
daily-capacity reservation rejects an existing active SCHEDULED appointment;
NO_SHOW does not release the original capacity, and a failed duplicate booking
does not increment capacity again.

## Cambodia-local date handling

Business dates use PostgreSQL Cambodia-local dates. `capacityDate` is a
PostgreSQL DATE and an API `YYYY-MM-DD` value. The atomic reservation query
returns `capacity."capacity_date"::text AS "capacityDate"`, never a timestamp.

## Internal reason codes

`SECOND_INSPECTION_FAILED`, `REINSPECTION_DEADLINE_EXPIRED`,
`NO_SHOW_LIMIT_REACHED`, and `NO_SHOW_REBOOKING_DEADLINE_EXPIRED` are internal
application-status-history reason codes, not citizen inspection-history fields.

## MVP limitations

This MVP has no distributed scheduler coordination and no exhaustive concurrency
E2E coverage. The two-attempt limit is not verified official MPWT policy.

## Verification and testing summary

Focused Phase 6 regression passed 7 suites / 86 tests; the full unit suite
passed 76 suites / 544 tests; PostgreSQL Phase 6 E2E passed 3/3 for the
schema/trigger guard, Attempt 1 PASS, and Attempt 1 FAIL.

Manual Postman smoke verified payment initialize/confirm, first manual NO_SHOW,
citizen status, replacement availability, selecting a replacement date after
the booking deadline, replacement booking, duplicate-booking 409, capacity
reserved once, and no fabricated citizen inspection history. It exposed the
raw-query `capacityDate` date-only bug; focused tests cover the fix.
