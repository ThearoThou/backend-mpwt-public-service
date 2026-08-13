# Payment workflow implementation

## Scope and integration

Phase 5 implements the MVP payment workflow for an application that is
`APPROVED` and has exactly one `SCHEDULED` appointment. Scheduling remains the
owner of its reservation transaction. After that transaction commits,
review-pass and citizen replacement appointment selection each attempt payment
initialization. A payment-initialization failure is logged and does not roll
back the approved application, appointment, or consumed daily capacity. An
admin can retry initialization explicitly.

Initialization is idempotent: a renewal application has at most one Payment
and one invoice. No payment status-history row is created by initialization.

## Payment creation and amount snapshots

The MVP creates a `PENDING`, `PAY_AT_STATION` payment in KHR. `BANK_QR` and
`BANK_CARD` remain enum foundations for future work; `provider_name` and
`provider_transaction_id` remain null in this MVP.

At creation, the service reads the vehicle's active inspection category and
`inspection_expiry_date`, then persists an immutable snapshot:

- `inspection_fee_khr` and `service_fee_khr` come from the live active
  category at that moment;
- `base_amount = inspection_fee_khr + service_fee_khr`;
- the payment calendar date is the Cambodia-local date
  (`Asia/Phnom_Penh`);
- `late_days = max(0, payment_creation_date - previous_inspection_expiry_date)`;
- `late_fee = late_days * 500 KHR`; and
- `total_amount = base_amount + late_fee`.

The calculation runs with PostgreSQL numeric/date operations and decimal values
remain strings in application code; it does not use JavaScript floating-point
arithmetic. Later documents use the persisted payment values rather than
re-reading category fees.

Creation is rejected when its source data is unsuitable, including a missing
vehicle classification/category, inactive category, missing or invalid expiry
source, or an application that does not satisfy the approved/scheduled
prerequisites. Those failures do not change already-committed scheduling.

## Payment status and history

The persisted payment enum is `PENDING`, `CONFIRMED`, `FAILED`, and
`REJECTED`. The implemented MVP transitions are:

| From       | To          | Rule                                                                            |
| ---------- | ----------- | ------------------------------------------------------------------------------- |
| `PENDING`  | `CONFIRMED` | Admin confirmation generates and stores a receipt and inspection sheet.         |
| `PENDING`  | `REJECTED`  | Admin rejection requires a trimmed, non-empty reason of at most 500 characters. |
| `REJECTED` | `PENDING`   | Admin reopen requires the same reason validation.                               |
| `REJECTED` | `CONFIRMED` | Admin confirmation is allowed.                                                  |

`CONFIRMED` is terminal. `FAILED` is reserved for future online-payment
support. Reopen and confirmation after rejection preserve the recorded
rejection summary metadata.

Each actual transition writes `payment_status_history` in the same database
transaction. A history record contains the previous and new status, actor,
reason, and timestamp.

## Payment documents

Initialization generates and privately stores an invoice. A confirmed payment
generates and stores its receipt and vehicle inspection sheet together. The
invoice is available while `PENDING`, `REJECTED`, or `CONFIRMED`; the receipt
and inspection sheet are available only while `CONFIRMED`.

Citizen document access is scoped to the caller's own application; authorized
admins access documents by payment ID. Download endpoints stream actual
`application/pdf` bytes and never expose private storage keys.

`PaymentPdfService` renders UTF-8 HTML through Puppeteer and its managed
Chromium runtime, embedding the bundled `NotoSansKhmer-Regular.ttf` asset for
Khmer. This replaced PDFKit after manual verification found PDFKit unsuitable
for the required Khmer complex-script rendering. The service keeps a
buffer-returning public API. Deployments must make Puppeteer's managed Chromium
runtime available. Invoice, receipt, and inspection-sheet Khmer rendering have
been manually verified.

## Persistence and verification

Migration `1786422084519-AddPaymentWorkflowFoundation` adds the payment
workflow snapshot fields and `payment_status_history`. It first refuses to run
when `payments` already contains rows, because existing payments cannot be
safely assigned the new expiry and late-day snapshot values.

Phase 5 is covered by focused unit/integration tests, guarded real PostgreSQL
API E2E tests, migration UP/DOWN/UP verification, and rollback verification.
Manual verification includes the Postman payment workflow and visual PDF
inspection.

Phase 6 physical inspection is not implemented. Its future workflow depends
on Payment being `CONFIRMED`.
