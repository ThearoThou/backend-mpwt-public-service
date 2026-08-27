import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  mapAdminApplicationDocument,
  type AdminApplicationDocumentSource,
} from '../applications/admin-application-document-response.mapper';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { InspectionResult } from './enums/inspection-result.enum';
import { InspectionStatus } from './enums/inspection-status.enum';
import type {
  AdminInspectionQueueView,
  CitizenInspectionHistoryQueryDto,
} from './dto/inspection-query.dtos';
import { AdminInspectionQueueQueryDto } from './dto/inspection-query.dtos';
import type {
  AdminInspectionDetailResponse,
  AdminApplicationInspectionDetailResponse,
  AdminInspectionQueueResponse,
  CitizenInspectionHistoryResponse,
  CitizenInspectionStatusResponse,
  InspectionSummaryResponse,
} from './inspection-response.mapper';

@Injectable()
export class InspectionReadsService {
  constructor(private readonly dataSource: DataSource) {}

  async listAdminQueue(input: AdminInspectionQueueQueryDto): Promise<{
    data: AdminInspectionQueueResponse[];
    meta: ReturnType<typeof createPaginationMeta>;
  }> {
    const view = input.view ?? 'PENDING';
    const where = ['appointment."daily_capacity_id" IS NOT NULL'];
    const parameters: unknown[] = [];
    const add = (condition: string, value?: unknown) => {
      if (value !== undefined) parameters.push(value);
      where.push(condition);
    };
    if (input.stationId !== undefined)
      add(`capacity."station_id" = $${parameters.length + 1}`, input.stationId);
    if (input.capacityDate !== undefined)
      add(
        `capacity."capacity_date" = $${parameters.length + 1}`,
        input.capacityDate,
      );
    const sortOrder = input.sortOrder === 'desc' ? 'DESC' : 'ASC';
    if (view === 'PENDING') {
      where.push(
        `application."status" = 'APPROVED'::"public"."application_status"`,
      );
      where.push(`payment."status" = 'CONFIRMED'::"public"."payment_status"`);
      where.push(
        `appointment."status" = 'SCHEDULED'::"public"."appointment_status"`,
      );
      where.push('inspection."id" IS NULL');
      where.push(
        `capacity."capacity_date" >= ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)`,
      );
      where.push('completed."completedPassCount" = 0');
      where.push('completed."completedFailCount" <= 1');
    }
    if (view === 'PASSED')
      add(
        `inspection."status" = 'COMPLETED'::"public"."inspection_status" AND inspection."result" = 'PASS'::"public"."inspection_result"`,
      );
    if (view === 'FAILED')
      add(
        `inspection."status" = 'COMPLETED'::"public"."inspection_status" AND inspection."result" = 'FAIL'::"public"."inspection_result"`,
      );
    parameters.push(input.limit, (input.page - 1) * input.limit);
    const rows = await this.dataSource.query<QueueRow[]>(
      `
      SELECT appointment."application_id" AS "applicationId", application."reference_number" AS "referenceNumber",
        appointment."id" AS "appointmentId", capacity."capacity_date"::text AS "capacityDate",
        station."id" AS "stationId", station."code" AS "stationCode", station."name_kh" AS "stationNameKh", station."name_en" AS "stationNameEn",
        application."vehicle_snapshot" ->> 'registrationNumber' AS "registrationNumber", application."vehicle_snapshot" ->> 'plateNumber' AS "plateNumber", application."vehicle_snapshot" ->> 'make' AS "make", application."vehicle_snapshot" ->> 'model' AS "model",
        inspection."id" AS "inspectionId", inspection."status" AS "inspectionStatus", inspection."attempt_number" AS "inspectionAttemptNumber", inspection."result" AS "inspectionResult", inspection."completed_at" AS "inspectedAt", inspection."failure_reason" AS "failureReason",
        completed."completedFailCount"::int AS "completedFailCount", completed."completedPassCount"::int AS "completedPassCount", COUNT(*) OVER()::int AS "total"
      FROM "appointments" appointment
      INNER JOIN "renewal_applications" application ON application."id" = appointment."application_id"
      INNER JOIN "inspection_station_daily_capacities" capacity ON capacity."id" = appointment."daily_capacity_id"
      INNER JOIN "inspection_stations" station ON station."id" = capacity."station_id"
      LEFT JOIN "payments" payment ON payment."application_id" = application."id"
      LEFT JOIN "inspections" inspection ON inspection."appointment_id" = appointment."id"
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE prior."status" = 'COMPLETED'::"public"."inspection_status" AND prior."result" = 'FAIL'::"public"."inspection_result") AS "completedFailCount", COUNT(*) FILTER (WHERE prior."status" = 'COMPLETED'::"public"."inspection_status" AND prior."result" = 'PASS'::"public"."inspection_result") AS "completedPassCount" FROM "inspections" prior WHERE prior."application_id" = application."id") completed ON true
      WHERE ${where.join(' AND ')}
      ORDER BY capacity."capacity_date" ${sortOrder}, appointment."id" ${sortOrder}
      LIMIT $${parameters.length - 1} OFFSET $${parameters.length}
    `,
      parameters,
    );
    return {
      data: rows.map((row) => this.mapQueue(row, view)),
      meta: createPaginationMeta(input.page, input.limit, rows[0]?.total ?? 0),
    };
  }

  async getAdminAppointmentDetail(
    appointmentId: string,
  ): Promise<AdminInspectionDetailResponse> {
    const [row] = await this.dataSource.query<DetailRow[]>(
      `
      SELECT appointment."id" AS "appointmentId", appointment."status" AS "appointmentStatus", appointment."daily_capacity_id" AS "dailyCapacityId", appointment."slot_id" AS "slotId",
        application."id" AS "applicationId", application."reference_number" AS "referenceNumber", application."status" AS "applicationStatus", application."vehicle_snapshot" AS "vehicleSnapshot",
        capacity."capacity_date"::text AS "capacityDate", station."id" AS "stationId", station."code" AS "stationCode", station."name_kh" AS "stationNameKh", station."name_en" AS "stationNameEn", station."province" AS "stationProvince", station."address" AS "stationAddress", station."phone" AS "stationPhone",
        payment."status" AS "paymentStatus", inspection."id" AS "inspectionId", inspection."status" AS "inspectionStatus", inspection."attempt_number" AS "inspectionAttemptNumber", inspection."result" AS "inspectionResult", inspection."completed_at" AS "inspectedAt", inspection."failure_reason" AS "failureReason",
        completed."completedFailCount"::int AS "completedFailCount", completed."completedPassCount"::int AS "completedPassCount",
        (capacity."capacity_date" = ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)) AS "isToday", (capacity."capacity_date" < ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)) AS "isPast"
      FROM "appointments" appointment
      INNER JOIN "renewal_applications" application ON application."id" = appointment."application_id"
      LEFT JOIN "inspection_station_daily_capacities" capacity ON capacity."id" = appointment."daily_capacity_id"
      LEFT JOIN "inspection_stations" station ON station."id" = capacity."station_id"
      LEFT JOIN "payments" payment ON payment."application_id" = application."id"
      LEFT JOIN "inspections" inspection ON inspection."appointment_id" = appointment."id"
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE prior."status" = 'COMPLETED'::"public"."inspection_status" AND prior."result" = 'FAIL'::"public"."inspection_result") AS "completedFailCount", COUNT(*) FILTER (WHERE prior."status" = 'COMPLETED'::"public"."inspection_status" AND prior."result" = 'PASS'::"public"."inspection_result") AS "completedPassCount" FROM "inspections" prior WHERE prior."application_id" = application."id") completed ON true
      WHERE appointment."id" = $1
    `,
      [appointmentId],
    );
    if (row === undefined)
      throw new DomainException(
        ApiErrorCode.APPOINTMENT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Appointment not found',
      );
    if (row.dailyCapacityId === null)
      throw new DomainException(
        ApiErrorCode.APPOINTMENT_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Legacy slot appointments are not supported by Phase 6',
      );
    const inspection = this.mapInspection(row);
    const attemptNumber =
      inspection?.attemptNumber ??
      this.pendingAttempt(row.completedFailCount, row.completedPassCount);
    const documents = await this.dataSource.query<DocumentRow[]>(
      `SELECT "id" AS "id", "application_id" AS "applicationId", "document_type" AS "documentType", "version_number" AS "versionNumber", "is_current" AS "isCurrent", "replaces_document_id" AS "replacesDocumentId", "original_file_name" AS "originalFileName", "mime_type" AS "mimeType", "file_size_bytes"::text AS "fileSizeBytes", "status" AS "status", "reviewed_by_user_id" AS "reviewedByUserId", "reviewed_at" AS "reviewedAt", "rejection_reason" AS "rejectionReason", "uploaded_at" AS "uploadedAt", "created_at" AS "createdAt", "updated_at" AS "updatedAt" FROM "application_documents" WHERE "application_id" = $1 AND "is_current" = true ORDER BY "document_type" ASC`,
      [row.applicationId],
    );
    const unsatisfied =
      row.inspectionId === null &&
      row.appointmentStatus === AppointmentStatus.SCHEDULED &&
      row.applicationStatus === ApplicationStatus.APPROVED;
    return {
      application: {
        id: row.applicationId,
        referenceNumber: row.referenceNumber,
        status: row.applicationStatus,
      },
      appointment: {
        id: row.appointmentId,
        status: row.appointmentStatus,
        capacityDate: row.capacityDate,
      },
      station: {
        id: row.stationId,
        code: row.stationCode,
        nameKh: row.stationNameKh,
        nameEn: row.stationNameEn,
        province: row.stationProvince,
        address: row.stationAddress,
        phone: row.stationPhone,
      },
      vehicle: this.vehicle(row.vehicleSnapshot),
      documents: documents.map(mapAdminApplicationDocument),
      payment: { status: row.paymentStatus },
      inspection,
      attemptNumber,
      canRecordResult:
        unsatisfied && row.paymentStatus === 'CONFIRMED' && row.isToday,
      canMarkNoShow: unsatisfied && row.isPast,
    };
  }

  async getAdminApplicationInspectionDetail(
    applicationId: string,
  ): Promise<AdminApplicationInspectionDetailResponse> {
    const [row] = await this.dataSource.query<ApplicationAttemptDetailRow[]>(
      `
      SELECT application."id" AS "applicationId", application."reference_number" AS "referenceNumber", application."status" AS "applicationStatus",
        inspection."id" AS "inspectionId", inspection."status" AS "inspectionStatus", inspection."attempt_number" AS "inspectionAttemptNumber", inspection."result" AS "inspectionResult", inspection."completed_at" AS "inspectedAt", inspection."failure_reason" AS "failureReason",
        station."id" AS "stationId", station."code" AS "stationCode", station."name_kh" AS "stationNameKh", station."name_en" AS "stationNameEn"
      FROM "renewal_applications" application
      LEFT JOIN LATERAL (
        SELECT i.* FROM "inspections" i
        WHERE i."application_id" = application."id"
          AND i."status" = 'COMPLETED'::"public"."inspection_status"
        ORDER BY i."completed_at" DESC, i."id" DESC
        LIMIT 1
      ) inspection ON true
      LEFT JOIN "inspection_stations" station ON station."id" = inspection."actual_station_id"
      WHERE application."id" = $1
      `,
      [applicationId],
    );
    if (row === undefined) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }
    const inspection = this.mapInspection(row);
    if (
      inspection !== null &&
      (row.stationId === null ||
        row.stationCode === null ||
        row.stationNameKh === null ||
        row.stationNameEn === null)
    ) {
      throw this.invalidInspectionState();
    }
    return {
      application: {
        id: row.applicationId,
        referenceNumber: row.referenceNumber,
        status: row.applicationStatus,
      },
      inspection:
        inspection === null
          ? null
          : {
              ...inspection,
              station: {
                id: row.stationId as string,
                code: row.stationCode as string,
                nameKh: row.stationNameKh as string,
                nameEn: row.stationNameEn as string,
              },
            },
    };
  }

  async getCitizenApplicationStatus(
    citizenId: string,
    applicationId: string,
  ): Promise<CitizenInspectionStatusResponse> {
    const [row] = await this.dataSource.query<CitizenStatusRow[]>(
      `
      SELECT application."id" AS "applicationId", application."status" AS "applicationStatus",
        latest_inspection."id" AS "inspectionId", latest_inspection."attempt_number" AS "inspectionAttemptNumber", latest_inspection."result" AS "inspectionResult", latest_inspection."completed_at" AS "inspectedAt", latest_inspection."failure_reason" AS "failureReason",
        latest_appointment."status" AS "latestAppointmentStatus", latest_appointment."capacityDate" AS "latestAppointmentDate",
        attempts."attemptsUsed"::int AS "attemptsUsed", attempts."completedPassCount"::int AS "completedPassCount", first_fail."failedDate" AS "firstFailDate", first_no_show."missedDate" AS "firstNoShowDate",
        EXISTS (SELECT 1 FROM "appointments" scheduled WHERE scheduled."application_id" = application."id" AND scheduled."status" = 'SCHEDULED'::"public"."appointment_status" AND scheduled."daily_capacity_id" IS NOT NULL) AS "hasScheduledReplacement",
        EXISTS (SELECT 1 FROM "appointments" legacy WHERE legacy."application_id" = application."id" AND legacy."daily_capacity_id" IS NULL AND legacy."slot_id" IS NOT NULL) AS "hasLegacyAppointment",
        ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)::text AS "today"
      FROM "renewal_applications" application
      LEFT JOIN LATERAL (SELECT inspection."id", inspection."attempt_number", inspection."result", inspection."completed_at", inspection."failure_reason" FROM "inspections" inspection WHERE inspection."application_id" = application."id" AND inspection."status" = 'COMPLETED'::"public"."inspection_status" ORDER BY inspection."completed_at" DESC, inspection."id" DESC LIMIT 1) latest_inspection ON true
      LEFT JOIN LATERAL (SELECT appointment."status", capacity."capacity_date"::text AS "capacityDate" FROM "appointments" appointment INNER JOIN "inspection_station_daily_capacities" capacity ON capacity."id" = appointment."daily_capacity_id" WHERE appointment."application_id" = application."id" ORDER BY capacity."capacity_date" DESC, appointment."id" DESC LIMIT 1) latest_appointment ON true
      LEFT JOIN LATERAL (SELECT COUNT(*) AS "attemptsUsed", COUNT(*) FILTER (WHERE inspection."result" = 'PASS'::"public"."inspection_result") AS "completedPassCount" FROM "inspections" inspection WHERE inspection."application_id" = application."id" AND inspection."status" = 'COMPLETED'::"public"."inspection_status") attempts ON true
      LEFT JOIN LATERAL (SELECT ((inspection."completed_at" AT TIME ZONE 'Asia/Phnom_Penh')::date + 30)::text AS "failedDate" FROM "inspections" inspection WHERE inspection."application_id" = application."id" AND inspection."status" = 'COMPLETED'::"public"."inspection_status" AND inspection."attempt_number" = 1 AND inspection."result" = 'FAIL'::"public"."inspection_result" LIMIT 1) first_fail ON true
      LEFT JOIN LATERAL (SELECT (capacity."capacity_date" + 30)::text AS "missedDate" FROM "appointments" appointment INNER JOIN "inspection_station_daily_capacities" capacity ON capacity."id" = appointment."daily_capacity_id" WHERE appointment."application_id" = application."id" AND appointment."status" = 'NO_SHOW'::"public"."appointment_status" ORDER BY capacity."capacity_date" ASC, appointment."id" ASC LIMIT 1) first_no_show ON true
      WHERE application."id" = $1 AND application."citizen_id" = $2
      `,
      [applicationId, citizenId],
    );
    if (row === undefined) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }
    if (row.latestAppointmentStatus === null && row.hasLegacyAppointment) {
      throw this.invalidInspectionState();
    }
    return this.mapCitizenStatus(row);
  }

  async listCitizenInspectionHistory(
    citizenId: string,
    input: CitizenInspectionHistoryQueryDto,
  ): Promise<{
    data: CitizenInspectionHistoryResponse[];
    meta: ReturnType<typeof createPaginationMeta>;
  }> {
    if (input.vehicleId !== undefined) {
      await this.assertCitizenOwnsVehicle(citizenId, input.vehicleId);
    }
    const order = input.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const parameters: unknown[] = [citizenId];
    const vehicleCondition =
      input.vehicleId === undefined
        ? ''
        : ` AND application."vehicle_id" = $${parameters.push(input.vehicleId)}`;
    parameters.push(input.limit, (input.page - 1) * input.limit);
    const rows = await this.dataSource.query<CitizenHistoryRow[]>(
      `
      SELECT inspection."application_id" AS "applicationId", application."reference_number" AS "referenceNumber", inspection."attempt_number" AS "attemptNumber", inspection."result" AS "result", inspection."completed_at" AS "inspectedAt", inspection."failure_reason" AS "failureReason", station."id" AS "stationId", station."name_kh" AS "stationNameKh", station."name_en" AS "stationNameEn", application."vehicle_snapshot" ->> 'registrationNumber' AS "registrationNumber", application."vehicle_snapshot" ->> 'plateNumber' AS "plateNumber", application."vehicle_snapshot" ->> 'plateCategory' AS "plateCategory", application."vehicle_snapshot" ->> 'plateProvince' AS "plateProvince", application."vehicle_snapshot" ->> 'make' AS "make", application."vehicle_snapshot" ->> 'model' AS "model", COUNT(*) OVER()::int AS "total"
      FROM "inspections" inspection
      INNER JOIN "renewal_applications" application ON application."id" = inspection."application_id" AND application."citizen_id" = $1
      LEFT JOIN "inspection_stations" actual_station ON actual_station."id" = inspection."actual_station_id"
      LEFT JOIN "appointments" appointment ON appointment."id" = inspection."appointment_id"
      LEFT JOIN "inspection_station_daily_capacities" capacity ON capacity."id" = appointment."daily_capacity_id"
      LEFT JOIN "appointment_slots" slot ON slot."id" = appointment."slot_id"
      LEFT JOIN "inspection_stations" capacity_station ON capacity_station."id" = capacity."station_id"
      LEFT JOIN "inspection_stations" slot_station ON slot_station."id" = slot."station_id"
      LEFT JOIN "inspection_stations" station ON station."id" = COALESCE(actual_station."id", capacity_station."id", slot_station."id")
      WHERE inspection."status" = 'COMPLETED'::"public"."inspection_status"${vehicleCondition}
      ORDER BY inspection."completed_at" ${order}, inspection."id" ${order}
      LIMIT $${parameters.length - 1} OFFSET $${parameters.length}
      `,
      parameters,
    );
    return {
      data: rows.map((row) => ({
        applicationId: row.applicationId,
        referenceNumber: row.referenceNumber,
        attemptNumber: Number(row.attemptNumber),
        result: row.result,
        inspectedAt: row.inspectedAt,
        failureReason:
          row.result === InspectionResult.FAIL ? row.failureReason : null,
        station:
          row.stationId === null ||
          row.stationNameKh === null ||
          row.stationNameEn === null
            ? null
            : {
                id: row.stationId,
                nameKh: row.stationNameKh,
                nameEn: row.stationNameEn,
              },
        vehicle: {
          registrationNumber: row.registrationNumber,
          plateNumber: row.plateNumber,
          plateCategory: row.plateCategory,
          plateProvince: row.plateProvince,
          make: row.make,
          model: row.model,
        },
      })),
      meta: createPaginationMeta(input.page, input.limit, rows[0]?.total ?? 0),
    };
  }

  private async assertCitizenOwnsVehicle(
    citizenId: string,
    vehicleId: string,
  ): Promise<void> {
    const [vehicle] = await this.dataSource.query<{ id: string }[]>(
      `SELECT "id" FROM "vehicles" WHERE "id" = $1 AND "linked_citizen_id" = $2 LIMIT 1`,
      [vehicleId, citizenId],
    );
    if (vehicle !== undefined) return;
    throw new DomainException(
      ApiErrorCode.VEHICLE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Vehicle not found',
    );
  }

  private mapQueue(
    row: QueueRow,
    view: AdminInspectionQueueView,
  ): AdminInspectionQueueResponse {
    const inspection = this.mapInspection(row);
    return {
      applicationId: row.applicationId,
      referenceNumber: row.referenceNumber,
      appointmentId: row.appointmentId,
      capacityDate: row.capacityDate,
      queueView: view,
      attemptNumber:
        inspection?.attemptNumber ??
        this.pendingAttempt(row.completedFailCount, row.completedPassCount),
      station: {
        id: row.stationId,
        code: row.stationCode,
        nameKh: row.stationNameKh,
        nameEn: row.stationNameEn,
      },
      vehicle: {
        registrationNumber: row.registrationNumber,
        plateNumber: row.plateNumber,
        make: row.make,
        model: row.model,
      },
      inspection,
    };
  }
  private mapCitizenStatus(
    row: CitizenStatusRow,
  ): CitizenInspectionStatusResponse {
    const terminal = [
      ApplicationStatus.CANCELLED,
      ApplicationStatus.INSPECTION_FAILED,
    ].includes(row.applicationStatus);
    const applicationActionable =
      row.applicationStatus === ApplicationStatus.APPROVED;
    const inspection =
      row.inspectionId === null
        ? null
        : {
            id: row.inspectionId,
            attemptNumber: Number(row.inspectionAttemptNumber),
            result: row.inspectionResult as InspectionResult,
            inspectedAt: row.inspectedAt as Date,
            failureReason:
              row.inspectionResult === InspectionResult.FAIL
                ? row.failureReason
                : null,
          };
    if (
      row.completedPassCount > 0 &&
      (row.completedPassCount !== 1 ||
        inspection?.result !== InspectionResult.PASS)
    ) {
      throw this.invalidInspectionState();
    }
    const latestPass = inspection?.result === InspectionResult.PASS;
    const activeFail =
      applicationActionable &&
      !latestPass &&
      row.firstFailDate !== null &&
      row.attemptsUsed === 1;
    const activeNoShow =
      applicationActionable &&
      !latestPass &&
      row.firstFailDate === null &&
      row.firstNoShowDate !== null;
    const actionableFail =
      activeFail && row.firstFailDate !== null && row.firstFailDate > row.today;
    const actionableNoShow =
      activeNoShow &&
      row.firstNoShowDate !== null &&
      row.firstNoShowDate >= row.today;
    return {
      applicationId: row.applicationId,
      applicationStatus: row.applicationStatus,
      inspection,
      latestAppointmentStatus: row.latestAppointmentStatus,
      attemptsUsed: row.attemptsUsed,
      attemptsRemaining: Math.max(0, 2 - row.attemptsUsed),
      reinspectionRequired: activeFail,
      reinspectionDeadline: activeFail ? row.firstFailDate : null,
      replacementBookingRequired:
        !row.hasScheduledReplacement && (actionableFail || actionableNoShow),
      replacementBookingDeadline: activeNoShow ? row.firstNoShowDate : null,
      stickerEligible: !terminal && latestPass,
    };
  }
  private mapInspection(row: InspectionRow): InspectionSummaryResponse | null {
    if (row.inspectionId === null) return null;
    if (
      row.inspectionStatus !== InspectionStatus.COMPLETED ||
      row.inspectionResult === null ||
      row.inspectedAt === null
    ) {
      throw this.invalidInspectionState();
    }
    return {
      id: row.inspectionId,
      attemptNumber: Number(row.inspectionAttemptNumber),
      result: row.inspectionResult,
      inspectedAt: row.inspectedAt,
      failureReason:
        row.inspectionResult === InspectionResult.FAIL
          ? row.failureReason
          : null,
    };
  }
  private pendingAttempt(
    completedFailCount: number,
    completedPassCount: number,
  ): number {
    if (completedPassCount > 0 || completedFailCount > 1) {
      throw this.invalidInspectionState();
    }
    if (completedFailCount === 0) return 1;
    if (completedFailCount === 1) return 2;
    throw this.invalidInspectionState();
  }
  private invalidInspectionState(): DomainException {
    throw new DomainException(
      ApiErrorCode.INSPECTION_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'Inspection state is invalid for the requested action',
    );
  }
  private vehicle(
    snapshot: Record<string, unknown> | null,
  ): AdminInspectionQueueResponse['vehicle'] {
    const string = (key: string) =>
      typeof snapshot?.[key] === 'string' ? snapshot[key] : null;
    return {
      registrationNumber: string('registrationNumber'),
      plateNumber: string('plateNumber'),
      make: string('make'),
      model: string('model'),
    };
  }
}

interface InspectionRow {
  inspectionId: string | null;
  inspectionStatus: InspectionStatus | null;
  inspectionAttemptNumber: number | null;
  inspectionResult: InspectionResult | null;
  inspectedAt: Date | null;
  failureReason: string | null;
}
interface QueueRow extends InspectionRow {
  applicationId: string;
  referenceNumber: string | null;
  appointmentId: string;
  capacityDate: string;
  stationId: string;
  stationCode: string;
  stationNameKh: string;
  stationNameEn: string;
  registrationNumber: string | null;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  completedFailCount: number;
  completedPassCount: number;
  total: number;
}
interface DetailRow extends InspectionRow {
  appointmentId: string;
  appointmentStatus: AppointmentStatus;
  dailyCapacityId: string | null;
  slotId: string | null;
  applicationId: string;
  referenceNumber: string | null;
  applicationStatus: ApplicationStatus;
  vehicleSnapshot: Record<string, unknown> | null;
  capacityDate: string;
  stationId: string;
  stationCode: string;
  stationNameKh: string;
  stationNameEn: string;
  stationProvince: string;
  stationAddress: string;
  stationPhone: string | null;
  paymentStatus: string | null;
  completedFailCount: number;
  completedPassCount: number;
  isToday: boolean;
  isPast: boolean;
}
interface ApplicationAttemptDetailRow extends InspectionRow {
  applicationId: string;
  referenceNumber: string | null;
  applicationStatus: ApplicationStatus;
  stationId: string | null;
  stationCode: string | null;
  stationNameKh: string | null;
  stationNameEn: string | null;
}
type DocumentRow = AdminApplicationDocumentSource;
interface CitizenStatusRow {
  applicationId: string;
  applicationStatus: ApplicationStatus;
  inspectionId: string | null;
  inspectionAttemptNumber: number | null;
  inspectionResult: InspectionResult | null;
  inspectedAt: Date | null;
  failureReason: string | null;
  latestAppointmentStatus: AppointmentStatus | null;
  latestAppointmentDate: string | null;
  attemptsUsed: number;
  completedPassCount: number;
  firstFailDate: string | null;
  firstNoShowDate: string | null;
  hasScheduledReplacement: boolean;
  hasLegacyAppointment: boolean;
  today: string;
}
interface CitizenHistoryRow {
  applicationId: string;
  referenceNumber: string | null;
  attemptNumber: number;
  result: InspectionResult;
  inspectedAt: Date;
  failureReason: string | null;
  stationId: string | null;
  stationNameKh: string | null;
  stationNameEn: string | null;
  registrationNumber: string | null;
  plateNumber: string | null;
  plateCategory: string | null;
  plateProvince: string | null;
  make: string | null;
  model: string | null;
  total: number;
}
