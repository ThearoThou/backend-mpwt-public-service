# Payment workflow implementation

## Scope and integration

### Phase 6 inspection invariant

Physical result recording requires `CONFIRMED` payment. Replacement and
reinspection reuse that same payment: no second initialization, fee, invoice,
or payment-state mutation occurs. NO_SHOW does not cancel, reset, or reject it.

Step 4 implements the MVP `PAY_AT_STATION` invoice workflow for an owned
`DRAFT` application. The citizen initializes an invoice before final
submission; this creates a `PENDING` payment but does not collect money, reserve
capacity, create an appointment, or generate a VIR application reference.
Final submission then requires that pending station payment and performs the
existing `DRAFT → SUBMITTED` transition, including the VIR reference and
snapshots.

Scheduling remains the owner of its reservation transaction. Review-pass and
citizen appointment selection reuse the existing payment without recalculating
fees, creating another payment, or generating another invoice. The legacy admin
initializer remains available for older approved and scheduled applications
that do not yet have a payment.

Initialization is idempotent: a renewal application has at most one Payment
and one invoice. No payment status-history row is created by initialization.

Citizens have read/download access to their owned payment, invoice, receipt,
and inspection sheet only. There is no implemented citizen payment-method
selection, card/QR/bank checkout, payment proof upload, or payment
confirmation. `PAY_AT_STATION` is the current initialized method; payment
confirmation, rejection, and reopening are ADMIN operations.

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
- `late_fee = 0` when `late_days <= 30`; after that late-penalty threshold it is
  `late_days * 500 KHR` for a `LIGHT` vehicle or `late_days * 2,000 KHR` for a
  `HEAVY` vehicle; and
- `total_amount = base_amount + late_fee`.

The calculation runs with PostgreSQL numeric/date operations and decimal values
remain strings in application code; it does not use JavaScript floating-point
arithmetic. The fee rate uses the stored `vehicle.vehicleClass`, never a
vehicle-type inference. Later documents use the persisted payment values rather
than re-reading category fees.

Step 4 creation is rejected when its source data is unsuitable, including
missing/rejected required documents, a missing citizen profile, missing vehicle
classification/category, inactive category, missing or invalid expiry source,
or a missing/invalid preferred active station/date. It does not reserve the
preferred date. The legacy initializer still requires an approved application
with exactly one scheduled appointment.

The persisted payment values are the finalized MVP financial snapshot: later
review, approval, and appointment resolution reuse them and never silently
recalculate the invoice amount.

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

An invoice PDF can be generated while the application is still `DRAFT`; it
omits the application-reference row until final submission creates the VIR
reference. It remains identified by the invoice number and application ID.

If a draft/submitted application is cancelled, the existing `PENDING`
pay-at-station payment and invoice are retained for audit history. No money was
collected, so this MVP does not create a refund or invent a new payment status.

## Persistence and verification

Migration `1786422084519-AddPaymentWorkflowFoundation` adds the payment
workflow snapshot fields and `payment_status_history`. It first refuses to run
when `payments` already contains rows, because existing payments cannot be
safely assigned the new expiry and late-day snapshot values.

Phase 5 is covered by focused unit/integration tests, guarded real PostgreSQL
API E2E tests, migration UP/DOWN/UP verification, and rollback verification.
Manual verification includes the Postman payment workflow and visual PDF
inspection.

Phase 6 physical inspection is implemented. Result recording requires Payment
to be `CONFIRMED`; replacement and reinspection reuse that confirmed payment
without changing its state.
