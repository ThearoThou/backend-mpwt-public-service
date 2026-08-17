# Physical inspection stickers (Phase 7)

## Purpose and lifecycle

A Sticker represents a physical MPWT technical-inspection sticker issued after a
successful vehicle inspection. It is the final project workflow step:

`PASS -> READY_FOR_ISSUANCE -> ADMIN issues sticker -> COMPLETED`

`READY_FOR_ISSUANCE` is derived, not stored. The presentation states are
`NOT_READY`, `READY_FOR_ISSUANCE`, and `ISSUED`; there is no persisted
`StickerStatus` enum.

## Eligibility and issuance

Issuance requires an `APPROVED` application, exactly one completed `PASS`
inspection, a daily-capacity-backed inspection appointment, and no prior
Sticker. The command creates the Sticker, transitions the application from
`APPROVED` to `COMPLETED`, sets `completedAt`, and records status-history reason
`STICKER_ISSUED` in one transaction.

The successful PASS inspection derives the station through Inspection,
Appointment.dailyCapacityId, daily capacity, and station. Sticker does not
duplicate `station_id`; this MVP has no admin-station assignment model.

## Data and integrity

Sticker contains application, inspection, stickerNumber, issuedAt, and nullable
issuedByUser audit linkage. Application, inspection, and stickerNumber are each
unique. The application lock plus PostgreSQL uniqueness constraints protect
concurrent issuance. PostgreSQL `23505` is mapped to the public sticker conflict
errors. `issuedToday` and `issuedThisMonth` use `Asia/Phnom_Penh` calendar time.

## APIs

- `GET /admin/stickers`
- `GET /admin/stickers/applications/:applicationId`
- `POST /admin/stickers/applications/:applicationId/issue`
- `GET /applications/:applicationId/sticker-status`

The citizen endpoint is ownership-scoped and does not expose admin identity or
admin issuance actions.

## MVP exclusions

There is no pickup expiry, certificate management, reissue/replacement,
inventory, printing, QR generation, notification, or admin-station
authorization. These uniqueness and authorization decisions are project MVP
integrity rules, not a claim about official MPWT regulation.
