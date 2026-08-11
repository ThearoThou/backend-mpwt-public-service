# Applications

## Scope and boundaries

`ApplicationsModule` owns renewal application records, DRAFT/submission and
review transitions, application reads/status history, and versioned application
documents. `FilesModule` provides private file persistence for document bytes.
Scheduling validates preferences during submission and owns the cross-domain
reservation branch of review-pass; that behavior is documented in
[Scheduling](05-scheduling.md).

The route contract is maintained separately in
[`docs/api/02-rest-api-contracts.md`](../api/02-rest-api-contracts.md).

## Application foundation

Migration 7 introduced persisted `DRAFT` applications. A citizen creates one
for a vehicle only when that vehicle exists and is linked to the citizen. The
creation transaction writes the application and an initial immutable
`null → DRAFT` status-history row.

The partial unique index `uq_unfinished_application_per_vehicle` prevents a
vehicle from having more than one application in the current unfinished-status
set. For DRAFT support, `reference_number`, `applicant_snapshot`,
`vehicle_snapshot`, and `submitted_at` are nullable. Migration 8 added nullable
`current_rejection_reason` with a trimmed 1–500 character database check.

The current application status enum contains `DRAFT`, `SUBMITTED`,
`UNDER_REVIEW`, `CORRECTION_REQUIRED`, `APPOINTMENT_SELECTION_REQUIRED`,
`APPROVED`, `REJECTED`, `REINSPECTION_REQUIRED`, `CANCELLED`, and `COMPLETED`.
The presence of a stored enum value is not evidence of a complete route
workflow: no current operation transitions an application to
`REINSPECTION_REQUIRED` or `COMPLETED`.

Citizen list/detail/status-history operations enforce ownership. Admin list,
detail, document, and status-history reads operate on submitted applications;
drafts are excluded from the admin queue. Application and admin mappers return
safe fields rather than raw entities.

## Documents and private files

Required document types are exactly:

- `VEHICLE_REGISTRATION_CARD`
- `PREVIOUS_INSPECTION_CERTIFICATE`
- `CITIZEN_ID_CARD`

`NATIONAL_ID` is not part of the current enum. Documents are uploaded
separately from application creation using multipart input. The upload service
accepts a non-empty PDF, JPG/JPEG, or PNG whose extension and MIME type agree,
with a 5 MiB maximum. `FilesService` writes the content under the configured
private-storage root with a generated application document key; it rejects
storage-key traversal. If the later database transaction fails, the service
removes the just-written file when possible.

Each document records application/type, version number, current flag,
replacement link, uploader, safe display metadata, document review status, and
optional review/rejection fields. The database enforces positive version and
file size, 5 MiB maximum, unique `(application, type, version)`, and one
current row per application/type.

Upload is allowed only for an owned application in `DRAFT` or
`CORRECTION_REQUIRED`:

- During DRAFT, a current type cannot be uploaded a second time.
- During correction-required, only a current rejected document can be
  replaced. The old row becomes non-current, the replacement increments the
  version and references it, and the replacement starts `PENDING`.

Citizens can list current documents, list type history, and download only
through an owned application. Admin document endpoints read current documents,
history, and file downloads without citizen ownership scoping. There is no
standalone admin document-decision endpoint; request-correction writes the
current document outcomes as part of the review operation.

## Submission and citizen changes

`ApplicationWorkflowService.submit` locks the owned application and requires
`DRAFT`. It requires one current row for every required document type and no
required document still rejected. It then verifies the citizen profile and
vehicle, requires paired station/date preference fields, and asks scheduling to
revalidate that selection.

Only after those checks does submission generate the reference number,
snapshot applicant and vehicle data, set `submittedAt`, move to `SUBMITTED`,
and append status history. The reference uses the Cambodia-local submission
date plus random bytes. Submission retries a reference-number unique conflict
before returning an internal failure. It does not reserve capacity or create an
appointment.

`CORRECTION_REQUIRED → SUBMITTED` resubmission reuses the required-current
document validation and confirms existing submission snapshot/reference data.
It writes status history. A citizen can cancel only their own DRAFT, SUBMITTED,
CORRECTION_REQUIRED, or APPOINTMENT_SELECTION_REQUIRED application; cancellation
records actor/time/optional reason and history. It does not implement
daily-capacity release or appointment cancellation.

## Admin review

`AdminApplicationReviewService` runs each admin transition in a transaction and
locks the submitted application.

| Operation          | Current transition and effects                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start review       | `SUBMITTED → UNDER_REVIEW`; records `reviewStartedAt` when absent, clears current correction/rejection reasons, and appends history.                                                                                      |
| Request correction | `UNDER_REVIEW → CORRECTION_REQUIRED`; requires selected document types and reason, marks selected current documents `REJECTED`, marks other current documents `APPROVED`, records correction reason, and appends history. |
| Reject             | `UNDER_REVIEW → REJECTED`; requires reason, stores rejection reason, appends history, and writes an `APPLICATION_REJECTED` audit row.                                                                                     |
| Reopen             | `REJECTED → UNDER_REVIEW`; requires reason, clears rejection reason, appends history, and writes an `APPLICATION_REOPENED` audit row including the reopen reason.                                                         |
| Review pass        | Delegates to/coordinates the daily-capacity reservation path. It is not a status-only approval action; see [Scheduling](05-scheduling.md).                                                                                |

`renewal_application_status_history` is append-only at the database layer. Its
check permits a null previous status only for the initial DRAFT record; its
trigger rejects updates and deletes. Each service transition validates its
source status and returns `APPLICATION_INVALID_TRANSITION` before any success
effects when the state is not eligible.

## Application versus scheduling responsibility

The application domain owns DRAFT creation, document/submission prerequisites,
regular review transitions, status history, and application ownership. It also
requires a DRAFT preference before submission and revalidates it without
reserving capacity.

The review-pass operation is a cross-domain transaction: an available
preference reserves daily capacity, creates a SCHEDULED daily-capacity
appointment, and moves `UNDER_REVIEW → APPROVED`; an unavailable preference
moves to `APPOINTMENT_SELECTION_REQUIRED` without an appointment or counter
change. Citizen recovery selection follows the matching reservation branch.
The locking, atomic update, compatibility, and rollback details belong to the
[Scheduling](05-scheduling.md) document.

## Tests and implementation checks

Application tests cover DRAFT creation/uniqueness, submission snapshots and
reference conflicts, document prerequisites, correction resubmission,
citizen cancellation, document upload/versioning/file validation, ownership,
admin queue/detail/history mapping, and every implemented review transition.
Application integration tests cover transactional workflow behavior. Phase 4
real PostgreSQL rollback/e2e tests additionally prove that a later failure does
not leave a capacity reservation, appointment, status change, or status-history
row behind.
