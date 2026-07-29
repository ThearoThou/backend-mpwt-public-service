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

-- 9. Guarantee that an inspection appointment belongs to the same application.
ALTER TABLE appointments
ADD CONSTRAINT uq_appointments_id_application
UNIQUE (id, application_id);

ALTER TABLE inspections
ADD CONSTRAINT fk_inspections_appointment_application
FOREIGN KEY (appointment_id, application_id)
REFERENCES appointments (id, application_id);
