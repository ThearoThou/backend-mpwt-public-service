import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import { inspectionPolicy } from '../config/inspection-policy';
import {
  AdminStickerQueryDto,
  type AdminStickerView,
} from './dto/sticker-query.dto';
import type {
  AdminStickerListResponse,
  StickerDetailResponse,
  StickerPresentationState,
} from './sticker-response.mapper';

export type CitizenStickerStatusResponse = Omit<
  StickerDetailResponse,
  'actions'
>;

@Injectable()
export class StickerReadsService {
  constructor(private readonly dataSource: DataSource) {}

  async listAdmin(input: AdminStickerQueryDto): Promise<{
    data: AdminStickerListResponse[];
    meta: ReturnType<typeof createPaginationMeta>;
    summary: StickerSummary;
  }> {
    const view = input.view ?? 'AWAITING';
    const parameters: unknown[] = [input.limit, (input.page - 1) * input.limit];
    const rows = await this.dataSource.query<StickerListRow[]>(
      listSql(view),
      parameters,
    );
    const [summary] =
      await this.dataSource.query<StickerSummary[]>(summarySql());
    return {
      data: rows.map(mapListRow),
      meta: createPaginationMeta(input.page, input.limit, rows[0]?.total ?? 0),
      summary,
    };
  }

  async getAdminDetail(applicationId: string): Promise<StickerDetailResponse> {
    return this.resolve(applicationId);
  }

  async getCitizenStatus(
    citizenId: string,
    applicationId: string,
  ): Promise<CitizenStickerStatusResponse> {
    const [owner] = await this.dataSource.query<Array<{ citizenId: string }>>(
      `SELECT "citizen_id" AS "citizenId" FROM "renewal_applications" WHERE "id" = $1`,
      [applicationId],
    );
    if (owner === undefined) throw applicationNotFound();
    if (owner.citizenId !== citizenId)
      throw new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Application is not owned by the authenticated citizen',
      );
    const { actions, ...safe } = await this.resolve(applicationId);
    void actions;
    return safe;
  }

  private async resolve(applicationId: string): Promise<StickerDetailResponse> {
    const [row] = await this.dataSource.query<DetailRow[]>(detailSql(), [
      applicationId,
    ]);
    if (row === undefined) throw applicationNotFound();
    if (Number(row.passCount) > 1)
      throw new DomainException(
        ApiErrorCode.INSPECTION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Application has inconsistent completed PASS inspections',
      );
    const state: StickerPresentationState =
      row.stickerId !== null
        ? 'ISSUED'
        : row.applicationStatus === ApplicationStatus.APPROVED &&
            row.paymentStatus === 'CONFIRMED' &&
            row.readyForInspectionAt !== null &&
            row.withinInitialPeriod &&
            Number(row.passCount) === 1 &&
            row.inspectionId !== null &&
            row.stationId !== null
          ? 'READY_FOR_ISSUANCE'
          : 'NOT_READY';
    return {
      state,
      application: {
        id: row.applicationId,
        referenceNumber: row.referenceNumber,
        status: row.applicationStatus,
        completedAt: row.applicationCompletedAt,
      },
      vehicle: {
        registrationNumber: readSnapshot(
          row.vehicleSnapshot,
          'registrationNumber',
        ),
        plateNumber: readSnapshot(row.vehicleSnapshot, 'plateNumber'),
        make: readSnapshot(row.vehicleSnapshot, 'make'),
        model: readSnapshot(row.vehicleSnapshot, 'model'),
      },
      ownerName:
        readSnapshot(row.applicantSnapshot, 'nameKh') ??
        readSnapshot(row.applicantSnapshot, 'nameEn'),
      inspection:
        row.inspectionId === null || row.completedAt === null
          ? null
          : {
              id: row.inspectionId,
              attemptNumber: Number(row.attemptNumber),
              completedAt: row.completedAt,
            },
      station:
        row.stationId === null ||
        row.stationCode === null ||
        row.stationNameKh === null ||
        row.stationNameEn === null
          ? null
          : {
              id: row.stationId,
              code: row.stationCode,
              nameKh: row.stationNameKh,
              nameEn: row.stationNameEn,
            },
      sticker:
        row.stickerId === null ||
        row.stickerNumber === null ||
        row.issuedAt === null
          ? null
          : {
              id: row.stickerId,
              stickerNumber: row.stickerNumber,
              issuedAt: row.issuedAt,
            },
      actions: { canIssueSticker: state === 'READY_FOR_ISSUANCE' },
    };
  }
}

export interface StickerSummary {
  awaitingIssuance: number;
  issuedToday: number;
  issuedThisMonth: number;
}
interface StickerListRow {
  applicationId: string;
  referenceNumber: string | null;
  vehicleSnapshot: Record<string, unknown> | null;
  applicantSnapshot: Record<string, unknown> | null;
  inspectionId: string | null;
  attemptNumber: number | null;
  completedAt: Date | null;
  stationId: string | null;
  stationCode: string | null;
  stationNameKh: string | null;
  stationNameEn: string | null;
  stickerId: string | null;
  stickerNumber: string | null;
  issuedAt: Date | null;
  total: number;
}
interface DetailRow extends StickerListRow {
  applicationStatus: ApplicationStatus;
  applicationCompletedAt: Date | null;
  paymentStatus: string | null;
  readyForInspectionAt: Date | null;
  withinInitialPeriod: boolean;
  passCount: number;
}

function mapListRow(row: StickerListRow): AdminStickerListResponse {
  return {
    applicationId: row.applicationId,
    referenceNumber: row.referenceNumber,
    vehicle: {
      registrationNumber: readSnapshot(
        row.vehicleSnapshot,
        'registrationNumber',
      ),
      plateNumber: readSnapshot(row.vehicleSnapshot, 'plateNumber'),
      make: readSnapshot(row.vehicleSnapshot, 'make'),
      model: readSnapshot(row.vehicleSnapshot, 'model'),
    },
    ownerName:
      readSnapshot(row.applicantSnapshot, 'nameKh') ??
      readSnapshot(row.applicantSnapshot, 'nameEn'),
    inspection:
      row.inspectionId === null || row.completedAt === null
        ? null
        : {
            id: row.inspectionId,
            attemptNumber: Number(row.attemptNumber),
            completedAt: row.completedAt,
          },
    station:
      row.stationId === null ||
      row.stationCode === null ||
      row.stationNameKh === null ||
      row.stationNameEn === null
        ? null
        : {
            id: row.stationId,
            code: row.stationCode,
            nameKh: row.stationNameKh,
            nameEn: row.stationNameEn,
          },
    sticker:
      row.stickerId === null ||
      row.stickerNumber === null ||
      row.issuedAt === null
        ? null
        : {
            id: row.stickerId,
            stickerNumber: row.stickerNumber,
            issuedAt: row.issuedAt,
          },
  };
}
function readSnapshot(
  snapshot: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = snapshot?.[key];
  return typeof value === 'string' ? value : null;
}
function applicationNotFound(): DomainException {
  return new DomainException(
    ApiErrorCode.APPLICATION_NOT_FOUND,
    HttpStatus.NOT_FOUND,
    'Application not found',
  );
}

function passAggregate(): string {
  return `LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE i."attempt_number" = 1 AND i."status" = 'COMPLETED'::"public"."inspection_status" AND i."result" = 'PASS'::"public"."inspection_result") AS "passCount" FROM "inspections" i WHERE i."application_id" = application."id") pass ON true`;
}
function passStation(): string {
  return `LEFT JOIN LATERAL (SELECT i."id" AS "inspectionId", i."attempt_number" AS "attemptNumber", i."completed_at" AS "completedAt", station."id" AS "stationId", station."code" AS "stationCode", station."name_kh" AS "stationNameKh", station."name_en" AS "stationNameEn" FROM "inspections" i LEFT JOIN "inspection_stations" actual_station ON actual_station."id" = i."actual_station_id" LEFT JOIN "appointments" appointment ON appointment."id" = i."appointment_id" LEFT JOIN "inspection_station_daily_capacities" capacity ON capacity."id" = appointment."daily_capacity_id" LEFT JOIN "appointment_slots" slot ON slot."id" = appointment."slot_id" LEFT JOIN "inspection_stations" capacity_station ON capacity_station."id" = capacity."station_id" LEFT JOIN "inspection_stations" slot_station ON slot_station."id" = slot."station_id" LEFT JOIN "inspection_stations" station ON station."id" = COALESCE(actual_station."id", capacity_station."id", slot_station."id") WHERE i."application_id" = application."id" AND i."attempt_number" = 1 AND i."status" = 'COMPLETED'::"public"."inspection_status" AND i."result" = 'PASS'::"public"."inspection_result" AND i."completed_at" IS NOT NULL ORDER BY i."completed_at" DESC, i."id" DESC LIMIT 1) passed ON true`;
}
function readinessSql(): string {
  return `application."status" = 'APPROVED'::"public"."application_status" AND application."submitted_at" IS NOT NULL AND application."ready_for_inspection_at" IS NOT NULL AND payment."status" = 'CONFIRMED'::"public"."payment_status" AND (now() AT TIME ZONE 'Asia/Phnom_Penh')::date < (application."submitted_at" AT TIME ZONE 'Asia/Phnom_Penh')::date + ${inspectionPolicy.application.initialInspectionPeriodDays} AND pass."passCount" = 1 AND passed."inspectionId" IS NOT NULL AND sticker."id" IS NULL`;
}
function listSql(view: AdminStickerView): string {
  const awaiting = view === 'AWAITING';
  return `SELECT application."id" AS "applicationId", application."reference_number" AS "referenceNumber", application."vehicle_snapshot" AS "vehicleSnapshot", application."applicant_snapshot" AS "applicantSnapshot", passed."inspectionId", passed."attemptNumber", passed."completedAt", passed."stationId", passed."stationCode", passed."stationNameKh", passed."stationNameEn", sticker."id" AS "stickerId", sticker."sticker_number" AS "stickerNumber", sticker."issued_at" AS "issuedAt", COUNT(*) OVER()::int AS "total" FROM ${awaiting ? '"renewal_applications" application' : '"stickers" sticker INNER JOIN "renewal_applications" application ON application."id" = sticker."application_id"'} ${passAggregate()} ${passStation()} LEFT JOIN "payments" payment ON payment."application_id" = application."id" ${awaiting ? 'LEFT JOIN "stickers" sticker ON sticker."application_id" = application."id"' : ''} WHERE ${awaiting ? readinessSql() : 'true'} ORDER BY ${awaiting ? 'passed."completedAt" ASC, application."id" ASC' : 'sticker."issued_at" DESC, sticker."id" DESC'} LIMIT $1 OFFSET $2`;
}
function summarySql(): string {
  return `SELECT (SELECT COUNT(*)::int FROM "renewal_applications" application ${passAggregate()} ${passStation()} LEFT JOIN "payments" payment ON payment."application_id" = application."id" LEFT JOIN "stickers" sticker ON sticker."application_id" = application."id" WHERE ${readinessSql()}) AS "awaitingIssuance", (SELECT COUNT(*)::int FROM "stickers" WHERE ("issued_at" AT TIME ZONE 'Asia/Phnom_Penh')::date = (now() AT TIME ZONE 'Asia/Phnom_Penh')::date) AS "issuedToday", (SELECT COUNT(*)::int FROM "stickers" WHERE date_trunc('month', "issued_at" AT TIME ZONE 'Asia/Phnom_Penh') = date_trunc('month', now() AT TIME ZONE 'Asia/Phnom_Penh')) AS "issuedThisMonth"`;
}
function detailSql(): string {
  return `SELECT application."id" AS "applicationId", application."reference_number" AS "referenceNumber", application."status" AS "applicationStatus", application."completed_at" AS "applicationCompletedAt", application."ready_for_inspection_at" AS "readyForInspectionAt", payment."status" AS "paymentStatus", ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date < (application."submitted_at" AT TIME ZONE 'Asia/Phnom_Penh')::date + ${inspectionPolicy.application.initialInspectionPeriodDays}) AS "withinInitialPeriod", application."vehicle_snapshot" AS "vehicleSnapshot", application."applicant_snapshot" AS "applicantSnapshot", pass."passCount"::int AS "passCount", passed."inspectionId", passed."attemptNumber", passed."completedAt", passed."stationId", passed."stationCode", passed."stationNameKh", passed."stationNameEn", sticker."id" AS "stickerId", sticker."sticker_number" AS "stickerNumber", sticker."issued_at" AS "issuedAt", 0::int AS "total" FROM "renewal_applications" application ${passAggregate()} ${passStation()} LEFT JOIN "payments" payment ON payment."application_id" = application."id" LEFT JOIN "stickers" sticker ON sticker."application_id" = application."id" WHERE application."id" = $1`;
}
