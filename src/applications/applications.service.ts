import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import {
  mapRenewalApplication,
  type RenewalApplicationResponse,
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
    const [applications, total] = await this.applicationQuery()
      .where('application.citizenId = :citizenId', { citizenId })
      .orderBy('application.createdAt', 'DESC')
      .addOrderBy('application.id', 'DESC')
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: applications.map(mapRenewalApplication),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async getCitizenApplication(
    citizenId: string,
    applicationId: string,
  ): Promise<RenewalApplicationResponse> {
    return mapRenewalApplication(
      await this.findCitizenApplication(citizenId, applicationId),
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

  private async findCitizenApplication(
    citizenId: string,
    applicationId: string,
  ): Promise<RenewalApplication> {
    const application = await this.applicationQuery()
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
  data: RenewalApplicationResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}

interface RenewalApplicationStatusHistoryListResult {
  data: RenewalApplicationStatusHistoryResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}
