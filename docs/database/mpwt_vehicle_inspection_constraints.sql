-- MPWT Vehicle Inspection Renewal Service
-- PostgreSQL constraints that are not fully represented visually in DBML.

-- 1. A user must have at least one login identifier.
ALTER TABLE users
ADD CONSTRAINT chk_users_phone_or_email
CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- 2. One active renewal application per vehicle.
CREATE UNIQUE INDEX uq_active_application_per_vehicle
ON renewal_applications (vehicle_id)
WHERE status IN (
  'SUBMITTED',
  'UNDER_REVIEW',
  'CORRECTION_REQUIRED',
  'READY_FOR_INSPECTION'
);

-- 3. One current document per application and document type.
CREATE UNIQUE INDEX uq_current_document_per_type
ON application_documents (application_id, document_type)
WHERE is_current = true;

-- 4. One scheduled appointment per application.
CREATE UNIQUE INDEX uq_scheduled_appointment_per_application
ON appointments (application_id)
WHERE status = 'SCHEDULED';

-- 5. Slot validation.
ALTER TABLE appointment_slots
ADD CONSTRAINT chk_appointment_slot_capacity
CHECK (capacity > 0);

ALTER TABLE appointment_slots
ADD CONSTRAINT chk_appointment_slot_time
CHECK (end_time > start_time);

-- 6. Document validation.
ALTER TABLE application_documents
ADD CONSTRAINT chk_document_version
CHECK (version_number > 0);

ALTER TABLE application_documents
ADD CONSTRAINT chk_document_file_size
CHECK (file_size_bytes > 0);

-- 7. Payment amount validation.
ALTER TABLE payments
ADD CONSTRAINT chk_payment_amounts
CHECK (
  base_amount >= 0
  AND late_fee >= 0
  AND total_amount >= 0
  AND total_amount = base_amount + late_fee
);

-- 8. Prevent the same provider transaction from confirming multiple payments.
CREATE UNIQUE INDEX uq_provider_transaction
ON payments (provider_name, provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL;

-- 9. Provider name is required when a provider transaction ID exists.
ALTER TABLE payments
ADD CONSTRAINT chk_payments_provider_name_required
CHECK (
  provider_transaction_id IS NULL
  OR provider_name IS NOT NULL
);

-- 10. Guarantee that an inspection appointment belongs to the same application.
-- The supporting UNIQUE (id, application_id) constraint on appointments
-- is already created by the InitialSchema migration and must not be recreated.

ALTER TABLE inspections
ADD CONSTRAINT fk_inspections_appointment_application
FOREIGN KEY (appointment_id, application_id)
REFERENCES appointments (id, application_id)
ON DELETE RESTRICT;

-- 11. Refresh-session credential integrity. Raw refresh tokens are never stored.
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

-- The primary key supports session lookup by signed session ID.
CREATE INDEX idx_refresh_sessions_user_active
ON refresh_sessions (user_id, expires_at)
WHERE revoked_at IS NULL;

CREATE INDEX idx_refresh_sessions_expires_at
ON refresh_sessions (expires_at);
