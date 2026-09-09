# Vehicles

## Scope

The vehicle domain provides citizen-owned vehicle creation/list/detail,
unscoped admin vehicle reads, inspection vehicle category administration, and
admin classification with immutable history. It uses local PostgreSQL records;
there is no external vehicle-registry integration and no implemented general
vehicle edit or delete operation.

The HTTP route inventory is maintained in [`docs/api/02-rest-api-contracts.md`](../api/02-rest-api-contracts.md).

## Vehicle record, ownership, and renewal lookup

`Vehicle` stores a nullable `linked_citizen_id`, registration/chassis identity,
plate fields, descriptive vehicle fields, inspection dates, registered-owner
details, active flag, and optional classification fields. Citizen creation sets
`linkedCitizenId` from the authenticated actor; citizen list/detail queries
enforce that same ownership. Admin list/detail operations are not owner-scoped.

For the Vehicle Inspection Renewal frontend, Step Zero uses the existing
citizen-owned list endpoint to locate an already persisted vehicle. `GET
/vehicles` accepts optional exact `registrationNumber`, `chassisNumber`,
`plateNumber`, `plateCategory`, and `plateProvince` filters. The service always
adds `linkedCitizenId = authenticated citizen`; the frontend never supplies a
citizen ID. Plate filtering follows the same complete provincial/personalized
plate-identity normalization rules used by vehicle creation.

This renewal lookup is neither authoritative vehicle creation nor an external
MPWT registry lookup. `POST /vehicles` remains an existing generic citizen API,
but it is not the Vehicle Inspection Renewal Step Zero path.

`VehiclesService` normalizes registration number and chassis number by trimming,
collapsing whitespace, and uppercasing Latin script. Required descriptive text
is trimmed and rejected when blank; the registered-owner phone uses the shared
Cambodian-phone normalizer. Date-only fields are DTO-validated before
persistence.

The database and service together distinguish conflicts for registration
number, chassis number, and plate identity. The service prechecks records and
also translates PostgreSQL unique violations, so concurrent writes return the
appropriate domain conflict.

## Plate categories and display mapping

Migration 4 introduced `vehicle_plate_category` and Migration 5 changed the
province uniqueness rule. The current categories are:

- `PROVINCE`: `plateProvince` is required, must be one of the supported Khmer
  Cambodian capital/province labels, and `plateNumber` must match the current
  civilian province pattern. Uniqueness is the partial
  `(plate_province, plate_number)` index for this category.
- `PERSONALIZED_CAMBODIA`: `plateProvince` must be absent/null and the
  normalized plate number uses the current personalized Cambodia format.
  Uniqueness is the partial plate-number index for this category.

`mapVehicle` returns `plateCategory`, nullable `plateProvince`, and
`plateDisplayLabelKh`. For a provincial plate, the display label is the stored
Khmer province. For a personalized Cambodia plate, the mapper returns the
fixed Cambodian Khmer display label rather than an invented province value.

The database check `chk_vehicles_plate_province_category` enforces the
category/province pairing. Registration number and chassis number remain
globally unique. `plate_type` remains descriptive data; it is not part of the
current provincial uniqueness identity.

## Inspection vehicle categories

`inspection_vehicle_categories` contains an immutable category code, Khmer
name, optional English name, `LIGHT`/`HEAVY` vehicle class, positive validity
months, non-negative inspection/service fees, and active flag. ADMIN routes
create, list, read, and update the supported mutable fields. Category lookup
for vehicle classification requires an active category.

The system supports 19 approved MPWT inspection categories. Their detailed
validity values are maintained in the project MPWT inspection-category
reference, sourced from the project Excel/reference data. The original
high-level validity rules were cross-checked with the MPWT infographic, but the
infographic does not explicitly define every one of the 19 category mappings.
The additional detailed mappings were reviewed and approved for this project.
In particular, `MPWT0011532` at 48 months and `MPWT0011533` at 24 months are
approved project-reference mappings, not explicit category-code rows printed
in the infographic.

Migration 6 created the table and its code/class composite identity, blank-text
checks, positive validity check, non-negative fees, and class/activity index.
The database representation is authoritative in
[`docs/database`](../database/).

## Classification and immutable history

Only an admin may classify a vehicle. `VehicleClassificationService` trims and
requires a reason, locks the vehicle, loads an active target category, rejects
an unchanged category, then performs these writes in one transaction:

1. set vehicle class from the category;
2. set `inspectionCategoryId`, verification time, and verifying admin;
3. append a history row containing previous/new class and category, acting
   admin, reason, and creation time.

The classification-completeness check requires all four vehicle classification
fields to be null together or populated together. Composite foreign keys ensure
the category matches the assigned vehicle class. The first classification has
null previous class/category; subsequent records preserve the prior pair.

`vehicle_classification_history` is protected by
`fn_guard_vehicle_classification_history` and
`trg_guard_vehicle_classification_history`, which reject updates and deletes.
Admin history reads are ordered by `(createdAt, id)` descending and expose the
stored classification history through an explicit mapper.

## Vehicle Inspection Renewal classification requirement

The Vehicle Inspection Renewal Service operates only on existing vehicles that
have already been classified. `vehicleType` and `vehicleClass` are separate
data: vehicle type is descriptive, while the inspection class and
`inspectionCategoryId` are authoritative classification data. An eligible
renewal vehicle must have a complete, verified classification (`vehicleClass`,
`inspectionCategoryId`, `classificationVerifiedAt`, and
`classificationVerifiedBy`).

Step Zero reads this existing data and blocks draft creation when it is
incomplete. The renewal flow does not derive or modify a class from vehicle
type, does not choose a fallback category, and does not allow a citizen to
select an inspection class or category. Automatic vehicle-type-to-class
mapping is outside the renewal-service scope.

## Service and API boundary

`VehiclesController` handles citizen create/list/detail. `AdminVehiclesController`
handles admin list/detail, classification, and history. The separate inspection
category controller owns category CRUD. Controllers validate DTOs and roles;
services normalize, scope ownership, apply domain checks, and map safe
responses.

Vehicle responses deliberately expose classification class/category ID and
verification time, not the internal verifying-admin ID. There is no citizen
vehicle classification route, no generic PATCH route, and no registry lookup.

## Tests and migrations

Vehicle tests cover identifier normalization, plate validation/normalization,
Khmer province behavior, mapper display labels, citizen ownership, admin
filters, conflict mapping, classification DTO validation, active-category
requirements, unchanged-classification rejection, transaction/history writes,
immutable history metadata, and controller role boundaries. Migrations 4–6
provide the plate-category, uniqueness, category, classification, composite-FK,
and immutable-history database foundation.
