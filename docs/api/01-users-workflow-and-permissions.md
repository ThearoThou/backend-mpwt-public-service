# Users, Workflow, and Permissions

## 1. Scope and approved decisions

This document is the Task 4A design baseline for the MPWT Vehicle Inspection
Renewal Service. It describes intended first-release behavior; it does not add
an API contract, endpoint list, DTO, controller, service, guard, or database
rule.

The source of truth reviewed for this document is the approved DBML,
PostgreSQL constraint document, 15 TypeORM entities, 18 enum definitions, and
the NestJS module structure. The current modules group work into auth, users,
vehicles, applications, scheduling, payments, inspections, stickers,
notifications, activity, files, and admin areas.

Approved first-release decisions:

- `CITIZEN` is the public role and `ADMIN` is the internal role.
- `STAFF` is reserved and is not available in the first release.
- Both citizen and admin web interfaces are required.
- Vehicle data is local/mock; there is no external vehicle-registry
  integration.
- There are no server-side application drafts. A submitted application is the
  first persisted application state.
- A vehicle can have only one active application at a time.
- Applications use a public `reference_number` in addition to their UUID.
- Citizens may log in with either phone or email.
- A successfully verified citizen becomes `ACTIVE` immediately; administrator
  approval is not required.
- Authentication uses access-token-only JWTs in the first release. Refresh
  tokens and server-side token revocation are out of scope.
- Verification codes are stored only as hashes. SMS and email delivery are not
  implemented; a plaintext development code may be exposed only in a local
  development response or safe development log.
- All three approved document types are mandatory and must have an approved
  current version before an application becomes `READY_FOR_INSPECTION`.
- A citizen may book only for their own `READY_FOR_INSPECTION` application and
  an eligible `OPEN` slot with remaining capacity.
- Payment is at the inspection station. No online payment gateway is in scope.
- A `PENDING` payment is created when an appointment is booked, and payment must
  be `CONFIRMED` before an inspection result is recorded.
- Appointment rescheduling cancels the existing appointment and creates a new
  appointment; `slot_id` is never changed in place.
- `INSPECTION_FAILED`, `COMPLETED`, and `CANCELLED` are terminal application
  statuses. Reinspection is not implemented in the first release.
- Notifications are in-app only. `EMAIL` and `SMS` remain reserved channels.
- Application timeline events are citizen-facing; audit logs are internal and
  must never be exposed to citizens.

### Workflow enum inventory

| Enum | Approved values | Workflow use |
|---|---|---|
| `user_role` | `CITIZEN`, `ADMIN`, `STAFF` | Access scope; `STAFF` is reserved. |
| `user_status` | `PENDING_VERIFICATION`, `ACTIVE`, `DISABLED` | Account availability. |
| `verification_purpose` | `REGISTER_ACCOUNT`, `RESET_PASSWORD`, `CHANGE_PHONE` | Hashed verification-code purpose. |
| `application_status` | `SUBMITTED`, `UNDER_REVIEW`, `CORRECTION_REQUIRED`, `READY_FOR_INSPECTION`, `INSPECTION_FAILED`, `COMPLETED`, `CANCELLED` | Renewal lifecycle. |
| `document_type` | `VEHICLE_REGISTRATION_CARD`, `PREVIOUS_INSPECTION_CERTIFICATE`, `NATIONAL_ID` | All three are mandatory in the first release. |
| `document_status` | `PENDING`, `APPROVED`, `REJECTED` | Document review outcome. |
| `appointment_slot_status` | `OPEN`, `CLOSED`, `CANCELLED` | Slot availability. |
| `appointment_status` | `SCHEDULED`, `COMPLETED`, `CANCELLED`, `NO_SHOW` | Appointment lifecycle. |
| `payment_method` | `PAY_AT_STATION`, `BANK_QR`, `BANK_CARD` | First release uses `PAY_AT_STATION`; other values are reserved. |
| `payment_status` | `PENDING`, `CONFIRMED`, `FAILED`, `REJECTED` | `REJECTED` is used for manual station refusal; `FAILED` is reserved for future technical/provider failure. |
| `inspection_status` | `PENDING`, `COMPLETED` | Inspection recording lifecycle. |
| `inspection_result` | `PASS`, `FAIL` | Nullable until an inspection is completed. |
| `sticker_status` | `NOT_READY`, `READY_FOR_PICKUP`, `ISSUED` | Sticker/certificate lifecycle. |
| `notification_channel` | `IN_APP`, `EMAIL`, `SMS` | First release writes `IN_APP` only. |
| `notification_delivery_status` | `PENDING`, `SENT`, `FAILED` | Delivery bookkeeping. |
| `notification_type` | `APPLICATION_SUBMITTED`, `REVIEW_STARTED`, `CORRECTION_REQUIRED`, `DOCUMENTS_APPROVED`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `PAYMENT_FAILED`, `APPOINTMENT_SCHEDULED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_REMINDER`, `APPOINTMENT_NO_SHOW`, `READY_FOR_INSPECTION`, `INSPECTION_PASSED`, `INSPECTION_FAILED`, `STICKER_READY`, `APPLICATION_COMPLETED`, `APPLICATION_CANCELLED`, `SYSTEM_ANNOUNCEMENT` | Citizen notification vocabulary. |
| `timeline_event_type` | `APPLICATION_SUBMITTED`, `REVIEW_STARTED`, `CORRECTION_REQUIRED`, `CORRECTION_RESUBMITTED`, `DOCUMENTS_APPROVED`, `PAYMENT_PENDING`, `PAYMENT_CONFIRMED`, `PAYMENT_FAILED`, `APPOINTMENT_SCHEDULED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_NO_SHOW`, `READY_FOR_INSPECTION`, `INSPECTION_PASSED`, `INSPECTION_FAILED`, `STICKER_PREPARING`, `STICKER_READY`, `STICKER_ISSUED`, `APPLICATION_COMPLETED`, `APPLICATION_CANCELLED` | Citizen-facing application history. |
| `audit_actor_type` | `USER`, `SYSTEM` | Internal audit attribution. |

## 2. Actors and roles

| Role | Responsibilities and allowed work | Forbidden work | Data scope and record effects |
|---|---|---|---|
| `CITIZEN` | Register, verify an identifier, manage their own profile, use local/mock vehicle data, submit an application, upload replacement documents, book or cancel an eligible appointment, reschedule by cancelling and creating a new appointment, view own payment/inspection/sticker progress, and mark own notifications read. | Cannot review documents, change application workflow status directly, manage stations/slots, confirm payment, record inspection, issue stickers, view another citizen's data, or view audit logs. | Own records only, determined through `renewal_applications.citizen_id` and related application ownership. Submission, document replacement, booking, cancellation, and workflow-relevant changes create timeline events, audit records, and appropriate in-app notifications. Citizens never delete historical records. |
| `ADMIN` | Manage stations and slots, review applications/documents, request corrections, mark applications ready, manage appointment outcomes, confirm/reject station payment, record inspection, prepare/issue stickers, send announcements, and view audit logs. | Cannot act as `STAFF`, expose audit data to citizens, delete historical government-service records, or bypass ownership/consistency checks. | May read all operational records. Admin workflow actions create timeline events, audit records, and citizen notifications when the action matters to the applicant. Admin does not need an `admin_profiles` model. |
| `STAFF` | Reserved only. | No login, authorization policy, UI, or workflow action is defined in the first release. | Must be denied until a future approved scope defines responsibilities. |

`ACTIVE` is required before a user may perform normal authenticated actions.
`PENDING_VERIFICATION` may perform only the verification flow. A successful
registration verification immediately sets a citizen to `ACTIVE`. `DISABLED`
users may not authenticate or continue workflow actions, including when they
present an otherwise valid JWT.

## 3. Authentication workflow

### A. Facts directly supported by the schema

- A user has a role, status, nullable unique phone/email fields, and a hidden
  `password_hash`.
- The database requires at least one of phone or email.
- `phone_verified_at` and `email_verified_at` can be recorded independently.
- Verification codes have a destination, purpose, hidden `code_hash`, expiry,
  usage timestamp, and attempt count. They can be associated with a user or
  have a null `user_id` during registration.
- There is no session, refresh-token, OAuth, token-revocation, outbound-delivery,
  or administrator-approval table.

### B. Approved minimum first-release behavior

| Flow | Approved behavior |
|---|---|
| Citizen registration | Validate phone or email and password, create a `CITIZEN` user in `PENDING_VERIFICATION`, create the one-to-one citizen profile, and create a hashed `REGISTER_ACCOUNT` code for the chosen destination. |
| Phone or email verification | Match a non-expired, unused hashed code, enforce the attempt limit, mark the code used, populate the matching verification timestamp, and set the citizen account to `ACTIVE` immediately. No administrator approval is required. |
| Verification delivery | SMS/email delivery is not implemented. In local development only, the plaintext code may be returned as a development-only response field or written to a safe development log. It must never be stored in plaintext or exposed by production-style responses. |
| Citizen login | Accept either phone or email as the login identifier, verify the password hash, require `ACTIVE`, update `last_login_at`, and issue an access-token-only JWT. |
| Admin login | Apply the same credential/status checks, require `role = ADMIN`, and issue an access-token-only JWT. Admin accounts are created through a controlled one-time bootstrap process, not public registration. |
| Logout | Remove the access token on the client. Server-side revocation and refresh-token invalidation are out of scope. |
| Current-user profile | Return the authenticated user's own user and applicable citizen-profile data. Exclude password and verification-code hashes. |
| Password-reset request | Create a hashed `RESET_PASSWORD` code for the matched phone or email without revealing whether an account exists. |
| Password-reset completion | Verify the reset code, replace `password_hash`, and mark the code used. Existing access tokens cannot be centrally revoked in the first-release token model. |

### C. Authentication implementation constraints

- The login identifier must match exactly one user.
- Verification codes are purpose-specific, expiring, single-use, and
  attempt-limited.
- The initial administrator is provisioned by a controlled bootstrap process.
- There is no public administrator-registration endpoint.
- Refresh-token persistence, token rotation, server-side revocation, OAuth,
  social login, biometric login, and identity-provider integration are outside
  the first-release scope.

## 4. Renewal application workflow

There is no persisted draft. A citizen submits a complete request as a new
`SUBMITTED` application containing immutable applicant and vehicle snapshots.
The application remains the source of public lifecycle status; appointment,
payment, inspection, and sticker records provide the detailed operational
state.

### Application transitions

The first release contains exactly eight application transitions. A rejected
transition must leave all statuses and related records unchanged, return a
domain validation or authorization error, and create no success timeline event
or notification.

| # | Current → target | Actor and trigger | Preconditions and records updated | Timeline / notification / audit | Reversible |
|---:|---|---|---|---|---|
| 1 | New request → `SUBMITTED` | Citizen submits | Authenticated active citizen; local/mock vehicle is within their permitted scope; one-active-application rule passes; snapshots and all three initial required documents are stored. | `APPLICATION_SUBMITTED`; `APPLICATION_SUBMITTED` notification; audit submission. | No draft to return to. Cancellation is a separate transition. |
| 2 | `SUBMITTED` → `UNDER_REVIEW` | Admin starts review | Application is in the review queue and is not final. Set `review_started_at`. | `REVIEW_STARTED`; `REVIEW_STARTED` notification; audit review action. | No direct reverse transition. |
| 3 | `UNDER_REVIEW` → `CORRECTION_REQUIRED` | Admin requests corrections | At least one reason is recorded in `current_correction_reason`; one or more current documents are rejected or otherwise require correction. | `CORRECTION_REQUIRED`; `CORRECTION_REQUIRED` notification; audit reason and decision. | Yes, through corrected resubmission. |
| 4 | `CORRECTION_REQUIRED` → `SUBMITTED` | Citizen resubmits corrections | Citizen owns the application; required replacements are uploaded as new current versions with `PENDING` status. Clear or supersede the current correction reason as part of the transaction. | `CORRECTION_RESUBMITTED`; no dedicated notification to the same citizen; audit replacement and resubmission. | Yes, admin can request another correction. |
| 5 | `UNDER_REVIEW` → `READY_FOR_INSPECTION` | Admin accepts review | Current versions exist for `VEHICLE_REGISTRATION_CARD`, `PREVIOUS_INSPECTION_CERTIFICATE`, and `NATIONAL_ID`; all three are `APPROVED`; none is `PENDING` or `REJECTED`. Set `ready_for_inspection_at`. | `DOCUMENTS_APPROVED` and `READY_FOR_INSPECTION`; matching notifications; audit approval. | No normal reverse transition. |
| 6 | `READY_FOR_INSPECTION` → `INSPECTION_FAILED` | Admin records completed failed inspection | Appointment belongs to the application; payment is `CONFIRMED`; inspection is completed with `FAIL`; failure reason, recorder, and completion time are recorded. | `INSPECTION_FAILED`; `INSPECTION_FAILED` notification; audit result. | No. `INSPECTION_FAILED` is terminal. |
| 7 | `READY_FOR_INSPECTION` → `COMPLETED` | System after admin issues sticker | A completed inspection has `PASS`; the application sticker is `ISSUED`; set `completed_at`. | `STICKER_ISSUED` then `APPLICATION_COMPLETED`; `APPLICATION_COMPLETED` notification; audit issuance/completion. | No. `COMPLETED` is terminal. |
| 8 | Eligible non-final status → `CANCELLED` | Citizen or admin cancels | Citizen: owns the application; status is `SUBMITTED`, `CORRECTION_REQUIRED`, or `READY_FOR_INSPECTION`; payment is not `CONFIRMED`; no inspection is `COMPLETED`. Admin: application is non-final and inspection is not completed; a cancellation reason is required. Set `cancelled_at`, `cancelled_by_user_id`, and `cancellation_reason`. | `APPLICATION_CANCELLED`; `APPLICATION_CANCELLED` notification; audit cancellation. | No. `CANCELLED` is terminal. |

`READY_FOR_INSPECTION` remains the application status while a citizen books an
appointment, pays at the station, and awaits inspection. There are no separate
application enum values for scheduled appointment or payment confirmation.

`INSPECTION_FAILED`, `COMPLETED`, and `CANCELLED` are terminal. No first-release
transition returns any of them to an active status.

## 5. Document workflow

- All three current document types are mandatory:
  `VEHICLE_REGISTRATION_CARD`, `PREVIOUS_INSPECTION_CERTIFICATE`, and
  `NATIONAL_ID`.
- A citizen uploads documents for an application they own. `uploaded_by_user_id`
  preserves who uploaded each version.
- Current document status starts as `PENDING`. An admin changes it to
  `APPROVED` or `REJECTED`, recording reviewer, review time, and rejection
  reason where applicable.
- An application may become `READY_FOR_INSPECTION` only when one current version
  exists for every mandatory type, all three current versions are `APPROVED`,
  and none is `PENDING` or `REJECTED`.
- A rejected document is corrected by creating a new row with the same
  application/document type, a higher `version_number`, `is_current = true`,
  and `replaces_document_id` pointing at the previous version. The replaced row
  becomes `is_current = false`.
- The database enforces one current document per application/type, unique
  version numbers, positive versions, and positive file sizes. Replacement must
  be transactional.
- Citizens may view approved portions of document history for their own
  application according to the final presentation policy; admins may view all
  versions for review and audit. Historical versions remain stored and are not
  deleted.
- A document status is not silently edited backward. A new replacement version
  is the normal route for changed content.

## 6. Appointment workflow

- Admins create and maintain inspection stations, slots, capacity, and slot
  status. Stations and slots are closed or cancelled rather than broadly
  deleted.
- Citizens may list eligible `OPEN` slots and book a `SCHEDULED` appointment
  only for their own `READY_FOR_INSPECTION` application.
- Booking must transactionally lock or protect the slot, verify it is `OPEN`,
  count current `SCHEDULED` appointments, confirm remaining capacity, and
  enforce that the application has no existing `SCHEDULED` appointment.
- Successful booking creates the appointment and the application's one
  `PENDING` `PAY_AT_STATION` payment record in the same transaction.
- A citizen may cancel their own `SCHEDULED` appointment before its start time.
  An admin may cancel a scheduled appointment for an operational reason.
  Cancellation records `cancelled_at`, `cancelled_by_user_id`, and
  `cancellation_reason`.
- Admins mark attendance outcomes as `COMPLETED` or `NO_SHOW`. A cancelled or
  no-show appointment no longer consumes scheduled capacity.
- Rescheduling cancels the current appointment and creates a new appointment in
  one transaction. `slot_id` must never be changed in place because the original
  slot history must be preserved.
- The first release has no configurable cancellation deadline beyond the
  appointment start time, no cancellation fee, and no rescheduling limit.

## 7. Payment workflow

- The first-release method is `PAY_AT_STATION`; `BANK_QR` and `BANK_CARD` remain
  unused reserved enum values.
- Each application has at most one payment record. The record is created when
  the first appointment is successfully booked, has an invoice number, starts
  as `PENDING`, and uses the approved amount and currency constraints.
- An admin at the station confirms payment by setting `CONFIRMED`,
  `confirmed_at`, `confirmed_by_user_id`, and `receipt_number`.
- A `CONFIRMED` payment is required before an inspection result can be recorded.
- `REJECTED` means the manual station payment was refused or rejected by the
  station employee. The actor, rejection time, and reason must be recorded.
- `FAILED` is reserved for future technical or external-provider failures and
  is not used in the first-release manual payment workflow.
- Provider fields remain null for first-release `PAY_AT_STATION` payments.
- Citizens may view their own payment details but cannot edit payment status,
  amounts, invoice data, receipt data, or provider fields.
- Payment records are retained and never deleted. Exceptional correction after
  confirmation requires an approved administrative procedure and audit record.

## 8. Inspection and sticker workflow

### Inspection

- An admin records an inspection against an appointment and the same
  application. The composite foreign key enforces that consistency.
- The appointment must belong to the application, be eligible for inspection,
  and the application payment must be `CONFIRMED`.
- An inspection starts `PENDING`; completion records `COMPLETED`, a `PASS` or
  `FAIL` result, recorder, completion time, and notes. A `FAIL` result requires
  a failure reason.
- `PASS` allows creation or preparation of the application's one sticker.
- `FAIL` moves the application to terminal `INSPECTION_FAILED`.
- Reinspection is not implemented. A failed application cannot return to
  `READY_FOR_INSPECTION` or be reopened. A citizen may later submit a new
  application when the one-active-application rule permits it.

### Sticker and completion

- After a passed inspection, create or retain the one sticker record in
  `NOT_READY` and emit `STICKER_PREPARING` when preparation begins.
- An admin marks it `READY_FOR_PICKUP`, records `ready_at` and actor, and emits
  `STICKER_READY` plus the citizen notification.
- An admin marks it `ISSUED`, records recipient/pickup details, issuer, and
  `issued_at`, then emits `STICKER_ISSUED`.
- Sticker number, certificate number, and certificate-file assignment follow
  the approved number-generation and file-storage conventions defined during
  implementation planning. They must be unique when supplied.
- Only a `PASS` inspection and `ISSUED` sticker permit the application
  `COMPLETED` transition.

## 9. Authorization matrix

`Own` means application ownership through `renewal_applications.citizen_id`.
`—` means the role must never receive that operation in the first release.

| Resource | CITIZEN: list/view/create/update/delete | ADMIN: list/view/create/update/delete |
|---|---|---|
| User profile | Own only / registration creates user / update own permitted profile fields / no delete | All users / bootstrap provisions admin / manage permitted account status / no delete |
| Citizen profile | Own only / created with registration / update own permitted fields / no delete | All / controlled internal correction / no delete |
| Vehicle | Own/linked local mock only / create or select for own request / limited correction subject to snapshot rules / no delete | All / manage or correct local records / no delete |
| Renewal application | Own only / create by submission / cancellation only under approved conditions; no direct workflow-status edit / no delete | All / no citizen-owned creation / review, transition, and cancel under approved rules / no delete |
| Application document | Own application / upload initial or replacement version / replacement only, not in-place history edit / no delete | All / review current versions and view history / no binary or history delete |
| Inspection station | View/list active stations / — / — / — | All / create / update active details or status / no delete |
| Appointment slot | View/list eligible open slots / — / — / — | All / create / update capacity/status / no delete; close or cancel |
| Appointment | Own only / create booking, cancel before start, reschedule by cancel-and-create / no in-place slot update / no delete | All / create through approved operational flow / mark outcome, cancel, or assist rescheduling / no delete |
| Payment | Own only / created automatically with booking / no edit / no delete | All / creation is workflow-driven / confirm or reject; exceptional correction requires policy / no delete |
| Inspection | Own application result only / — / — / no delete | All / create or record / complete result after confirmed payment / no delete |
| Sticker | Own application status/certificate only / — / — / no delete | All / create or prepare / mark ready and issue / no delete |
| Notification | Own only / — / mark read only / no delete | All operational notifications / create announcement / delivery correction if needed / no broad delete |
| Timeline event | Own application and `visible_to_citizen = true` / — / — / no delete | All / created as workflow effect / no historical edit or delete |
| Audit log | — / — / — / — | List/view all / system-generated only / immutable / never delete |

## 10. Timeline-event rules

Timeline records belong to an application and default to citizen-visible. They
are created for material lifecycle actions, not ordinary reads. Use only the
approved enum values:

- Submission, review start, correction request/resubmission, document approval,
  appointment schedule/cancel/no-show, payment pending/confirmed, ready for
  inspection, inspection pass/fail, sticker preparation/ready/issued,
  completion, and cancellation use their matching timeline event types.
- `PAYMENT_PENDING` is created when appointment booking creates the payment.
- `PAYMENT_CONFIRMED` is created when station payment is confirmed.
- Database status `REJECTED` has no dedicated timeline enum. The exact
  citizen-facing wording or mapping is a non-blocking implementation decision;
  no new enum value may be invented.
- `PAYMENT_FAILED` is reserved for the future technical/provider failure flow
  unless a later approved mapping explicitly uses it for rejected manual
  payment.
- Timeline metadata may contain non-sensitive operational context. It must not
  contain password hashes, verification-code values/hashes, or internal audit
  details.

## 11. Notification rules

- First release creates `IN_APP` notifications only. `EMAIL` and `SMS` are not
  sent.
- Notifications are created for citizen-visible milestones with an approved
  `notification_type`, including corrections, document approval, appointment
  changes, payment pending/confirmation, inspection outcomes, sticker ready,
  completion, cancellation, and announcements.
- The recipient is the application citizen or an appropriate audience for a
  `SYSTEM_ANNOUNCEMENT`. Citizens can read only their own notifications and
  mark them read.
- No notification enum exists for correction resubmission, sticker issued, or
  rejected manual payment. These actions must not invent new notification
  types; exact citizen-facing handling for rejected payment remains a
  non-blocking implementation detail.

## 12. Audit-log rules

- Audit logs are internal, immutable, and never shown to citizens.
- Create an audit record for authentication-sensitive changes, application
  status transitions, document review, slot administration, booking,
  cancellation/rescheduling, payment decisions, inspection recording, sticker
  issuance, announcements, and privileged profile/vehicle changes.
- Record `USER` with actor user ID for an authenticated action and `SYSTEM` for
  automated completion/notification activity. Include action, entity type/ID,
  application when relevant, safe old/new values, request IP, and user agent
  where available.
- Do not put password hashes, verification codes, plaintext development codes,
  access tokens, or other secrets in old/new values.

## 13. Transaction boundaries

| Operation | Transaction boundary and reason |
|---|---|
| Application submission | Create application, snapshots, all three initial documents, timeline, notification, and audit together; prevent a partial submission or active-application race. |
| Document replacement | Insert the new version, switch `is_current`, link `replaces_document_id`, and create workflow/audit effects together. |
| Appointment booking and payment creation | Lock/check slot capacity, verify `OPEN`, enforce one scheduled appointment, create the appointment, create the one `PENDING` payment if it does not exist, and create timeline/notification/audit effects atomically. |
| Appointment cancellation or rescheduling | Change the current appointment to `CANCELLED`, create the replacement appointment when rescheduling, preserve history, release scheduled capacity, and record effects together. |
| Payment confirmation or rejection | Change payment state and actor/timestamps, assign receipt data on confirmation, and create timeline/notification/audit effects atomically. |
| Inspection completion | Verify appointment/application consistency and confirmed payment, complete inspection, update application status, create or prepare sticker when passed, and record effects together. |
| Sticker issuance | Record issuance/pickup fields, set `ISSUED`, complete the application only when `PASS` exists, and create timeline/notification/audit effects together. |
| Application cancellation | Validate actor-specific cancellation rules, cancel a scheduled appointment where required, update application cancellation fields, and create timeline/notification/audit effects atomically. |

## 14. Remaining business and implementation decisions

### A. Blocking before endpoint design

No blocking business decisions remain for Task 4B.

### B. Non-blocking implementation decisions

1. Vehicle-editing restrictions after an application snapshot exists.
2. Exact formats and generation rules for application reference numbers,
   invoice numbers, receipt numbers, sticker numbers, and certificate numbers.
3. Exact timing for sticker number, certificate number, and certificate-file
   assignment beyond their required uniqueness.
4. Notification wording, announcement audience selection, rejected-payment
   presentation, and in-app delivery retry bookkeeping.
5. Whether citizens can see every historical document version or only current
   and rejected/approved versions relevant to them.
6. Retention duration and exceptional administrative correction procedures for
   immutable operational records.
7. Whether the local development verification code is returned in a dedicated
   optional response field or written only to a safe development log.

### C. Explicitly out of scope for the first release

1. `STAFF` role workflows and interface.
2. External MPWT vehicle-registry integration.
3. Online gateway, bank QR, or card payment processing.
4. Email/SMS verification or notification delivery.
5. Refresh-token persistence, token rotation, and server-side token revocation.
6. OAuth, social login, biometric login, and identity-provider integration.
7. Server-side application drafts.
8. Reinspection or reopening an `INSPECTION_FAILED` application.

## 15. First-release scope limitations

- This is a local/mock vehicle-data workflow, not a production registry
  integration.
- The service has no application draft state and no online payment gateway.
- Authentication uses short-lived access-token-only JWTs; logout is client-side
  and issued tokens are not centrally revocable.
- Verification and notifications do not use real SMS or email delivery.
- Notifications are in-app only, and audit logs remain entirely internal.
- Historical application, document, payment, appointment, inspection, sticker,
  timeline, and audit records are retained rather than deleted through broad
  endpoints.
- The schema supports one payment and one sticker per application and one
  inspection per appointment.
- A failed inspection is terminal for the application. Reinspection requires a
  later approved workflow and is not part of the first release.
- `STAFF`, external registry integration, online payments, and production
  identity-provider integrations require future approved scope.
