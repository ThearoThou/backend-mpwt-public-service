-- MPWT Vehicle Inspection Renewal Service
-- PostgreSQL constraint reference. CURRENT EXECUTED SCHEMA is migrations 1-8;
-- TypeORM migrations are executable source of truth. Do not execute the
-- illustrative/deferred CREATE or ALTER statements below against an existing DB.
--
-- Deferred design (not yet migrated)
-- This file is documentation, not an executable migration or bootstrap script.
-- Existing executed migrations remain the executable source of truth until new,
-- reviewed migrations are created and applied. In particular, do not edit or
-- re-run 1785380837522-AddVehiclePlateCategories.ts or
-- 1785380837523-RemovePlateTypeFromProvincePlateUniqueness.ts.
--
-- Before any target migration: inspect legacy application/payment/appointment
-- rows. Any legacy enum mapping requires separate approval.

-- ---------------------------------------------------------------------------
-- CURRENT EXECUTED SCHEMA (migrations 6-8): reference only, do not re-run.
-- ---------------------------------------------------------------------------
-- vehicle_class is LIGHT/HEAVY. inspection_vehicle_categories,
-- vehicle_classification_history, chk_vehicles_classification_complete,
-- fk_vehicles_category_class, idx_vehicles_inspection_category_class,
-- fn_guard_vehicle_classification_history, and
-- trg_guard_vehicle_classification_history already exist with the exact names
-- in migration 6.
-- renewal_applications uses application_status values DRAFT, SUBMITTED,
-- UNDER_REVIEW, CORRECTION_REQUIRED, APPOINTMENT_SELECTION_REQUIRED, APPROVED,
-- REJECTED, REINSPECTION_REQUIRED, CANCELLED, COMPLETED. Migration 7 created
-- uq_unfinished_application_per_vehicle for DRAFT, SUBMITTED, UNDER_REVIEW,
-- CORRECTION_REQUIRED, APPOINTMENT_SELECTION_REQUIRED, APPROVED, and
-- REINSPECTION_REQUIRED.
-- renewal_application_status_history columns are id, application_id,
-- previous_status, new_status, changed_by_user_id, created_at; immutable guard
-- names are public.fn_guard_renewal_application_status_history and
-- trg_guard_renewal_application_status_history_immutable.
-- application_documents already has CITIZEN_ID_CARD, uq_current_document_per_type,
-- version uniqueness, and chk_application_documents_file_size_max_5mb.
-- Migration 8 added current_rejection_reason with
-- chk_renewal_applications_current_rejection_reason: NULL OR
-- char_length(btrim(current_rejection_reason)) BETWEEN 1 AND 500.
-- Phase 3C/3D correction/rejection/reopen are application workflow/audit_logs
-- behavior, not additional history-table columns or DB migrations.

-- ---------------------------------------------------------------------------
-- Existing executed vehicle-plate protections retained by the target model.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX uq_vehicles_province_plate_identity
ON vehicles (plate_province, plate_number)
WHERE plate_category = 'PROVINCE'::vehicle_plate_category;

CREATE UNIQUE INDEX uq_vehicles_personalized_plate_number
ON vehicles (plate_number)
WHERE plate_category = 'PERSONALIZED_CAMBODIA'::vehicle_plate_category;

ALTER TABLE vehicles
ADD CONSTRAINT chk_vehicles_plate_province_category
CHECK (
  (plate_category = 'PROVINCE'::vehicle_plate_category AND plate_province IS NOT NULL)
  OR (
    plate_category = 'PERSONALIZED_CAMBODIA'::vehicle_plate_category
    AND plate_province IS NULL
  )
);

-- CURRENT EXECUTED SCHEMA (migration 6)
-- Vehicle classification remains nullable for legacy vehicles. The class and
-- category are a single logical value and must be populated together.
-- Migration 6 uses chk_vehicles_classification_complete: vehicle_class,
-- inspection_category_id, classification_verified_at, and
-- classification_verified_by are either all NULL or all populated.
-- idx_vehicles_inspection_category_class supports the current relationship.

-- ---------------------------------------------------------------------------
-- Inspection vehicle categories and immutable classification history.
-- ---------------------------------------------------------------------------

-- CURRENT EXECUTED SCHEMA (migration 6)
ALTER TABLE inspection_vehicle_categories
ADD CONSTRAINT chk_vehicle_categories_code_not_blank
CHECK (btrim(code) <> '');

ALTER TABLE inspection_vehicle_categories
ADD CONSTRAINT chk_vehicle_categories_name_kh_not_blank
CHECK (btrim(name_kh) <> '');

ALTER TABLE inspection_vehicle_categories
ADD CONSTRAINT chk_vehicle_categories_validity_positive
CHECK (validity_months > 0);

ALTER TABLE inspection_vehicle_categories
ADD CONSTRAINT chk_vehicle_categories_inspection_fee_nonnegative
CHECK (inspection_fee_khr >= 0);

ALTER TABLE inspection_vehicle_categories
ADD CONSTRAINT chk_vehicle_categories_service_fee_nonnegative
CHECK (service_fee_khr >= 0);

ALTER TABLE inspection_vehicle_categories
ADD CONSTRAINT uq_inspection_vehicle_categories_id_class
UNIQUE (id, vehicle_class);

CREATE INDEX idx_inspection_vehicle_categories_class_active
ON inspection_vehicle_categories (vehicle_class, is_active);

ALTER TABLE vehicles
ADD CONSTRAINT fk_vehicles_category_class
FOREIGN KEY (inspection_category_id, vehicle_class)
REFERENCES inspection_vehicle_categories (id, vehicle_class)
ON DELETE RESTRICT;

ALTER TABLE vehicles
ADD CONSTRAINT fk_vehicles_classification_verified_by
FOREIGN KEY (classification_verified_by) REFERENCES users (id)
ON DELETE RESTRICT;

-- Category code and class are business-immutable after creation. Enforce this
-- in the category-management service; a later migration may add a narrowly
-- scoped trigger if direct database writes require the same protection.

ALTER TABLE vehicle_classification_history
ADD CONSTRAINT chk_vehicle_class_history_reason_not_blank
CHECK (btrim(reason) <> '');

ALTER TABLE vehicle_classification_history
ADD CONSTRAINT chk_vehicle_class_history_previous_pair
CHECK (
  (previous_vehicle_class IS NULL AND previous_inspection_category_id IS NULL)
  OR
  (previous_vehicle_class IS NOT NULL AND previous_inspection_category_id IS NOT NULL)
);

ALTER TABLE vehicle_classification_history
ADD CONSTRAINT fk_vehicle_class_history_vehicle
FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE RESTRICT;

ALTER TABLE vehicle_classification_history
ADD CONSTRAINT fk_vehicle_class_history_prev_category_class
FOREIGN KEY (previous_inspection_category_id, previous_vehicle_class)
REFERENCES inspection_vehicle_categories (id, vehicle_class)
ON DELETE RESTRICT;

ALTER TABLE vehicle_classification_history
ADD CONSTRAINT fk_vehicle_class_history_new_category_class
FOREIGN KEY (new_inspection_category_id, new_vehicle_class)
REFERENCES inspection_vehicle_categories (id, vehicle_class)
ON DELETE RESTRICT;

ALTER TABLE vehicle_classification_history
ADD CONSTRAINT fk_vehicle_class_history_changed_by_admin
FOREIGN KEY (changed_by_admin_id) REFERENCES users (id) ON DELETE RESTRICT;

CREATE INDEX idx_vehicle_classification_history_vehicle_created
ON vehicle_classification_history (vehicle_id, created_at, id);

-- CURRENT EXECUTED SCHEMA (migration 6): immutable-row protection.
CREATE OR REPLACE FUNCTION fn_guard_vehicle_classification_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER trg_guard_vehicle_classification_history
BEFORE UPDATE OR DELETE ON vehicle_classification_history
FOR EACH ROW EXECUTE FUNCTION fn_guard_vehicle_classification_history();

-- ---------------------------------------------------------------------------
-- Renewal lifecycle and authoritative immutable status history.
-- ---------------------------------------------------------------------------

-- CURRENT EXECUTED SCHEMA (migration 7): the application_status enum is
-- DRAFT, SUBMITTED, UNDER_REVIEW, CORRECTION_REQUIRED,
-- APPOINTMENT_SELECTION_REQUIRED, APPROVED, REJECTED,
-- REINSPECTION_REQUIRED, CANCELLED, and COMPLETED.

CREATE UNIQUE INDEX uq_unfinished_application_per_vehicle
ON renewal_applications (vehicle_id)
WHERE status IN (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CORRECTION_REQUIRED',
  'APPOINTMENT_SELECTION_REQUIRED',
  'APPROVED',
  'REINSPECTION_REQUIRED'
);

ALTER TABLE renewal_application_status_history
ADD CONSTRAINT fk_renewal_application_status_history_application
FOREIGN KEY (application_id) REFERENCES renewal_applications (id)
ON DELETE RESTRICT;

ALTER TABLE renewal_application_status_history
ADD CONSTRAINT fk_renewal_application_status_history_changed_by
FOREIGN KEY (changed_by_user_id) REFERENCES users (id)
ON DELETE RESTRICT;

CREATE INDEX idx_renewal_application_status_history_application_created
ON renewal_application_status_history (application_id, created_at, id);

CREATE TRIGGER trg_guard_renewal_application_status_history_immutable
BEFORE UPDATE OR DELETE ON renewal_application_status_history
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_renewal_application_status_history();

-- Reasons for corrections, rejections, reversals, classification-sensitive
-- actions, and controlled rescheduling are workflow rules. Their exact state
-- context is enforced by the application transition service, not a simple
-- row-local CHECK constraint.

-- ---------------------------------------------------------------------------
-- Versioned required documents.
-- ---------------------------------------------------------------------------

-- CURRENT EXECUTED SCHEMA (migration 7) for the CITIZEN_ID_CARD enum vocabulary.
-- Preserve version_number, is_current, replaces_document_id, uploader, and
-- reviewer metadata. One current row per application and document type remains.
CREATE UNIQUE INDEX uq_current_document_per_type
ON application_documents (application_id, document_type)
WHERE is_current = true;

ALTER TABLE application_documents
ADD CONSTRAINT chk_document_version
CHECK (version_number > 0);

ALTER TABLE application_documents
ADD CONSTRAINT chk_document_file_size
CHECK (file_size_bytes > 0);

-- CURRENT EXECUTED SCHEMA (migration 7)
ALTER TABLE application_documents
ADD CONSTRAINT chk_application_documents_file_size_max_5mb
CHECK (file_size_bytes <= 5242880);

-- PDF/JPG/JPEG/PNG acceptance is primarily application-level validation.
-- One file per required type is represented by the current-document index.

-- ---------------------------------------------------------------------------
-- Daily capacity and temporary hourly-slot compatibility.
-- ---------------------------------------------------------------------------

-- TARGET DESIGN — NOT YET MIGRATED
ALTER TABLE inspection_stations
ADD CONSTRAINT chk_inspection_stations_default_daily_capacity
CHECK (default_daily_capacity IS NULL OR default_daily_capacity > 0);

ALTER TABLE inspection_center_daily_capacities
ADD CONSTRAINT uq_inspection_center_daily_capacities_station_date
UNIQUE (station_id, capacity_date);

ALTER TABLE inspection_center_daily_capacities
ADD CONSTRAINT chk_inspection_center_daily_capacities_capacity
CHECK (daily_capacity > 0);

ALTER TABLE inspection_center_daily_capacities
ADD CONSTRAINT chk_inspection_center_daily_capacities_reserved_count
CHECK (reserved_count >= 0 AND reserved_count <= daily_capacity);

ALTER TABLE inspection_center_daily_capacities
ADD CONSTRAINT fk_inspection_center_daily_capacities_station
FOREIGN KEY (station_id) REFERENCES inspection_stations (id)
ON DELETE RESTRICT;

CREATE INDEX idx_inspection_center_daily_capacities_station_date_closed
ON inspection_center_daily_capacities (station_id, capacity_date, is_closed);

-- The application approval transaction, rather than a direct API update,
-- reserves capacity through this conditional write. No returned row means full
-- or closed capacity and the whole approval transaction must roll back.
-- UPDATE inspection_center_daily_capacities
-- SET reserved_count = reserved_count + 1
-- WHERE id = :capacityDayId
--   AND is_closed = false
--   AND reserved_count < daily_capacity
-- RETURNING id;

-- TARGET DESIGN — NOT YET MIGRATED
-- During transition slot_id remains for legacy appointments and daily_capacity_id
-- is used by all new daily-capacity appointments. A row uses exactly one.
ALTER TABLE appointments
ADD CONSTRAINT chk_appointments_slot_or_daily_capacity
CHECK (
  (slot_id IS NOT NULL AND daily_capacity_id IS NULL)
  OR
  (slot_id IS NULL AND daily_capacity_id IS NOT NULL)
);

ALTER TABLE appointments
ADD CONSTRAINT fk_appointments_daily_capacity
FOREIGN KEY (daily_capacity_id)
REFERENCES inspection_center_daily_capacities (id)
ON DELETE RESTRICT;

CREATE INDEX idx_appointments_daily_capacity_status
ON appointments (daily_capacity_id, status);

-- EXISTING EXECUTED SCHEMA — current active hourly-slot appointment rule.
CREATE UNIQUE INDEX uq_scheduled_appointment_per_application
ON appointments (application_id)
WHERE status = 'SCHEDULED';

-- TARGET DESIGN — NOT YET MIGRATED
CREATE UNIQUE INDEX uq_reserved_appointment_per_application
ON appointments (application_id)
WHERE status = 'RESERVED';

-- The current hourly-slot constraints remain valid while slots remain in use.
ALTER TABLE appointment_slots
ADD CONSTRAINT chk_appointment_slot_capacity
CHECK (capacity > 0);

ALTER TABLE appointment_slots
ADD CONSTRAINT chk_appointment_slot_time
CHECK (end_time > start_time);

-- ---------------------------------------------------------------------------
-- Approval-time invoices, phased payments, and receipts.
-- ---------------------------------------------------------------------------

-- TARGET DESIGN — NOT YET MIGRATED
ALTER TABLE renewal_invoices
ADD CONSTRAINT fk_renewal_invoices_application
FOREIGN KEY (application_id) REFERENCES renewal_applications (id)
ON DELETE RESTRICT;

ALTER TABLE renewal_invoices
ADD CONSTRAINT fk_renewal_invoices_cancelled_by_admin
FOREIGN KEY (cancelled_by_admin_id) REFERENCES users (id)
ON DELETE RESTRICT;

ALTER TABLE renewal_invoices
ADD CONSTRAINT chk_renewal_invoices_validity_months
CHECK (validity_months_snapshot > 0);

ALTER TABLE renewal_invoices
ADD CONSTRAINT chk_renewal_invoices_days_overdue
CHECK (days_overdue >= 0);

ALTER TABLE renewal_invoices
ADD CONSTRAINT chk_renewal_invoices_amounts_nonnegative
CHECK (
  inspection_fee_snapshot >= 0
  AND service_fee_snapshot >= 0
  AND penalty_rate_per_day >= 0
  AND penalty_amount_snapshot >= 0
  AND discount_amount_snapshot >= 0
  AND total_amount_snapshot >= 0
);

ALTER TABLE renewal_invoices
ADD CONSTRAINT chk_renewal_invoices_total_amount
CHECK (
  total_amount_snapshot = inspection_fee_snapshot
    + service_fee_snapshot
    + penalty_amount_snapshot
    - discount_amount_snapshot
);

ALTER TABLE renewal_invoices
ADD CONSTRAINT chk_renewal_invoices_currency_khr
CHECK (currency = 'KHR');

CREATE UNIQUE INDEX uq_unpaid_invoice_per_application
ON renewal_invoices (application_id)
WHERE status = 'UNPAID';

CREATE INDEX idx_renewal_invoices_application_issued
ON renewal_invoices (application_id, issued_at);

CREATE INDEX idx_renewal_invoices_status_issued
ON renewal_invoices (status, issued_at);

-- TARGET DESIGN — NOT YET MIGRATED
-- payments currently combines application, invoice, receipt, amount, and
-- provider data. Do not replace its columns until a database preflight has
-- inspected rows and an approved preservation mapping exists.
-- Target payment_method values: ONLINE, PAY_AT_CENTER.
-- Target payment_status values: UNPAID, PENDING, PAID, FAILED, CANCELLED.
-- TRANSITIONAL COMPATIBILITY — invoice_id is nullable. Existing rows retain
-- application_id and all legacy invoice/receipt fields.
ALTER TABLE payments
ADD CONSTRAINT fk_payments_invoice
FOREIGN KEY (invoice_id) REFERENCES renewal_invoices (id)
ON DELETE RESTRICT;

-- A partial unique index explicitly permits many legacy NULL invoice_id values.
CREATE UNIQUE INDEX uq_payments_invoice
ON payments (invoice_id)
WHERE invoice_id IS NOT NULL;

ALTER TABLE payment_receipts
ADD CONSTRAINT fk_payment_receipts_payment
FOREIGN KEY (payment_id) REFERENCES payments (id)
ON DELETE RESTRICT;

ALTER TABLE payment_receipts
ADD CONSTRAINT uq_payment_receipts_payment UNIQUE (payment_id);

ALTER TABLE payment_receipts
ADD CONSTRAINT uq_payment_receipts_number UNIQUE (receipt_number);

-- Receipt creation is allowed only after payment status is PAID by the payment
-- confirmation transaction. A cross-table status condition is enforced in
-- application logic, not by a plain CHECK.

-- ---------------------------------------------------------------------------
-- Existing foundation constraints retained by the target model.
-- ---------------------------------------------------------------------------

ALTER TABLE users
ADD CONSTRAINT chk_users_phone_or_email
CHECK (phone IS NOT NULL OR email IS NOT NULL);

ALTER TABLE inspections
ADD CONSTRAINT fk_inspections_appointment_application
FOREIGN KEY (appointment_id, application_id)
REFERENCES appointments (id, application_id)
ON DELETE RESTRICT;

-- EXISTING EXECUTED SCHEMA — legacy payment protections remain in force until
-- payment decomposition receives row-level preflight and separate approval.
ALTER TABLE payments
ADD CONSTRAINT chk_payment_amounts
CHECK (
  base_amount >= 0
  AND late_fee >= 0
  AND total_amount >= 0
  AND total_amount = base_amount + late_fee
);

CREATE UNIQUE INDEX uq_provider_transaction
ON payments (provider_name, provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL;

ALTER TABLE payments
ADD CONSTRAINT chk_payments_provider_name_required
CHECK (
  provider_transaction_id IS NULL
  OR provider_name IS NOT NULL
);

-- EXISTING EXECUTED SCHEMA — refresh-session credential integrity. These are
-- retained verbatim from the existing reference and are unaffected by target
-- workflow design.
ALTER TABLE refresh_sessions
ADD CONSTRAINT chk_refresh_sessions_token_hash_not_blank
CHECK (btrim(token_hash) <> '');

ALTER TABLE refresh_sessions
ADD CONSTRAINT chk_refresh_sessions_expires_after_created
CHECK (expires_at > created_at);

ALTER TABLE refresh_sessions
ADD CONSTRAINT chk_refresh_sessions_last_used_after_created
CHECK (last_used_at IS NULL OR last_used_at >= created_at);

ALTER TABLE refresh_sessions
ADD CONSTRAINT chk_refresh_sessions_revoked_after_created
CHECK (revoked_at IS NULL OR revoked_at >= created_at);

ALTER TABLE refresh_sessions
ADD CONSTRAINT chk_refresh_sessions_reuse_detected_after_created
CHECK (reuse_detected_at IS NULL OR reuse_detected_at >= created_at);

ALTER TABLE refresh_sessions
ADD CONSTRAINT chk_refresh_sessions_reuse_requires_revocation
CHECK (reuse_detected_at IS NULL OR revoked_at IS NOT NULL);

ALTER TABLE refresh_sessions
ADD CONSTRAINT chk_refresh_sessions_revocation_reason_pair
CHECK (
  (revoked_at IS NULL AND revocation_reason IS NULL)
  OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
);

ALTER TABLE refresh_sessions
ADD CONSTRAINT fk_refresh_sessions_user
FOREIGN KEY (user_id)
REFERENCES users (id)
ON DELETE CASCADE;

CREATE INDEX idx_refresh_sessions_user_active
ON refresh_sessions (user_id, expires_at)
WHERE revoked_at IS NULL;

CREATE INDEX idx_refresh_sessions_expires_at
ON refresh_sessions (expires_at);
