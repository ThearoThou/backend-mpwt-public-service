import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import {
  mapCitizenApplicationDetail,
  mapCitizenApplicationList,
  type CitizenApplicationDetailResponse,
  type CitizenApplicationListResponse,
} from './application-response.mapper';
import {
  mapRenewalApplicationStatusHistory,
  type RenewalApplicationStatusHistoryResponse,
} from './application-status-history-response.mapper';
import {
  type ListCitizenApplicationsQueryDto,
  type RenewalApplicationStatusHistoryQueryDto,
} from './dto/application-request.dtos';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(RenewalApplication)
    private readonly applications: Repository<RenewalApplication>,
    @InjectRepository(RenewalApplicationStatusHistory)
    private readonly statusHistory: Repository<RenewalApplicationStatusHistory>,
  ) {}

  async listCitizenApplications(
    citizenId: string,
    input: ListCitizenApplicationsQueryDto,
  ): Promise<RenewalApplicationListResult> {
    const query = this.applicationListQuery()
      .where('application.citizenId = :citizenId', { citizenId })
      .orderBy(
        'application.createdAt',
        input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      )
      .addOrderBy(
        'application.id',
        input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      );

    const statuses = [
      ...new Set([
        ...(input.statuses ?? []),
        ...(input.status === undefined ? [] : [input.status]),
      ]),
    ];
    if (statuses.length > 0) {
      query.andWhere('application.status IN (:...statuses)', { statuses });
    }

    if (input.search !== undefined) {
      query.andWhere(
        `(application.referenceNumber ILIKE :search
          OR (application.vehicleSnapshot IS NOT NULL AND (
            application.vehicleSnapshot ->> 'plateNumber' ILIKE :search
            OR application.vehicleSnapshot ->> 'registrationNumber' ILIKE :search
            OR application.vehicleSnapshot ->> 'make' ILIKE :search
            OR application.vehicleSnapshot ->> 'model' ILIKE :search
            OR application.vehicleSnapshot ->> 'manufactureYear' ILIKE :search
          ))
          OR (application.vehicleSnapshot IS NULL AND (
            vehicle.plateNumber ILIKE :search
            OR vehicle.registrationNumber ILIKE :search
            OR vehicle.make ILIKE :search
            OR vehicle.model ILIKE :search
            OR CAST(vehicle.manufactureYear AS TEXT) ILIKE :search
          )))`,
        { search: `%${input.search}%` },
      );
    }

    const [applications, total] = await query
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: applications.map(mapCitizenApplicationList),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async getCitizenApplication(
    citizenId: string,
    applicationId: string,
  ): Promise<CitizenApplicationDetailResponse> {
    return mapCitizenApplicationDetail(
      await this.findCitizenApplication(citizenId, applicationId, true),
    );
  }

  async listCitizenStatusHistory(
    citizenId: string,
    applicationId: string,
    input: RenewalApplicationStatusHistoryQueryDto,
  ): Promise<RenewalApplicationStatusHistoryListResult> {
    await this.findCitizenApplication(citizenId, applicationId);

    const [history, total] = await this.statusHistory
      .createQueryBuilder('history')
      .select([
        'history.id',
        'history.applicationId',
        'history.previousStatus',
        'history.newStatus',
        'history.changedByUserId',
        'history.createdAt',
      ])
      .where('history.applicationId = :applicationId', { applicationId })
      .orderBy('history.createdAt', 'DESC')
      .addOrderBy('history.id', 'DESC')
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: history.map(mapRenewalApplicationStatusHistory),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  private applicationQuery() {
    return this.applications
      .createQueryBuilder('application')
      .select([
        'application.id',
        'application.referenceNumber',
        'application.citizenId',
        'application.vehicleId',
        'application.status',
        'application.currentCorrectionReason',
        'application.currentRejectionReason',
        'application.preferredInspectionStationId',
        'application.preferredInspectionDate',
        'application.submittedAt',
        'application.reviewStartedAt',
        'application.readyForInspectionAt',
        'application.completedAt',
        'application.cancelledAt',
        'application.cancellationReason',
        'application.createdAt',
        'application.updatedAt',
      ]);
  }

  private applicationListQuery() {
    return this.applicationQuery()
      .addSelect('application.vehicleSnapshot')
      .leftJoinAndSelect('application.vehicle', 'vehicle')
      .leftJoinAndSelect('application.payment', 'payment')
      .leftJoinAndMapOne(
        'application.latestInspection',
        Inspection,
        'latestInspection',
        `"latestInspection"."application_id" = application."id" AND "latestInspection"."id" = (
          SELECT latest_completed_inspection."id"
          FROM "inspections" latest_completed_inspection
          WHERE latest_completed_inspection."application_id" = application."id"
            AND latest_completed_inspection."status" = :completedInspectionStatus
          ORDER BY latest_completed_inspection."completed_at" DESC, latest_completed_inspection."id" DESC
          LIMIT 1
        )`,
        { completedInspectionStatus: InspectionStatus.COMPLETED },
      );
  }

  private applicationDetailQuery() {
    return this.applicationQuery().addSelect('application.vehicleSnapshot');
  }

  private async findCitizenApplication(
    citizenId: string,
    applicationId: string,
    includeVehicleSnapshot = false,
  ): Promise<RenewalApplication> {
    const application = await (
      includeVehicleSnapshot
        ? this.applicationDetailQuery()
        : this.applicationQuery()
    )
      .where('application.id = :applicationId', { applicationId })
      .getOne();

    if (application === null) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }

    if (application.citizenId !== citizenId) {
      throw new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Renewal application is outside the citizen ownership scope',
      );
    }

    return application;
  }
}

interface RenewalApplicationListResult {
  data: CitizenApplicationListResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}

interface RenewalApplicationStatusHistoryListResult {
  data: RenewalApplicationStatusHistoryResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}
