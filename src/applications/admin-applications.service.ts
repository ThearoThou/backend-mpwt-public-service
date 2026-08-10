import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository, SelectQueryBuilder } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import {
  mapAdminApplicationDetail,
  mapAdminApplicationQueue,
  type AdminApplicationDetailResponse,
  type AdminApplicationQueueResponse,
} from './admin-application-response.mapper';
import {
  type AdminApplicationSortField,
  type AdminApplicationStatusHistoryQueryDto,
  type ListAdminApplicationsQueryDto,
} from './dto/admin-application-request.dtos';
import {
  mapRenewalApplicationStatusHistory,
  type RenewalApplicationStatusHistoryResponse,
} from './application-status-history-response.mapper';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';

@Injectable()
export class AdminApplicationsService {
  constructor(
    @InjectRepository(RenewalApplication)
    private readonly applications: Repository<RenewalApplication>,
    @InjectRepository(RenewalApplicationStatusHistory)
    private readonly statusHistory: Repository<RenewalApplicationStatusHistory>,
  ) {}

  async list(
    input: ListAdminApplicationsQueryDto,
  ): Promise<AdminApplicationQueueListResult> {
    const query = this.applicationQuery().where(
      'application.submittedAt IS NOT NULL',
    );

    if (input.status !== undefined) {
      query.andWhere('application.status = :status', { status: input.status });
    }

    if (input.referenceNumber !== undefined) {
      query.andWhere('application.referenceNumber ILIKE :referenceNumber', {
        referenceNumber: `%${input.referenceNumber}%`,
      });
    }

    if (input.plateNumber !== undefined) {
      query.andWhere(
        "application.vehicleSnapshot ->> 'plateNumber' ILIKE :plateNumber",
        { plateNumber: `%${input.plateNumber}%` },
      );
    }

    if (input.citizenSearch !== undefined) {
      query.andWhere(
        "(application.applicantSnapshot ->> 'nameKh' ILIKE :citizenSearch OR application.applicantSnapshot ->> 'nameEn' ILIKE :citizenSearch OR application.applicantSnapshot ->> 'nationalIdNumber' ILIKE :citizenSearch)",
        { citizenSearch: `%${input.citizenSearch}%` },
      );
    }

    if (input.submittedFrom !== undefined) {
      query.andWhere('application.submittedAt >= :submittedFrom', {
        submittedFrom: cambodiaDayStart(input.submittedFrom),
      });
    }

    if (input.submittedTo !== undefined) {
      query.andWhere('application.submittedAt < :submittedToExclusive', {
        submittedToExclusive: cambodiaNextDayStart(input.submittedTo),
      });
    }

    const [applications, total] = await query
      .orderBy(
        this.sortColumn(input.sortBy),
        input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      )
      .addOrderBy(
        'application.id',
        input.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      )
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: applications.map(mapAdminApplicationQueue),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async getDetail(
    applicationId: string,
  ): Promise<AdminApplicationDetailResponse> {
    return mapAdminApplicationDetail(
      await this.findSubmittedApplication(applicationId),
    );
  }

  async listStatusHistory(
    applicationId: string,
    input: AdminApplicationStatusHistoryQueryDto,
  ): Promise<AdminApplicationStatusHistoryListResult> {
    await this.findSubmittedApplication(applicationId);

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

  private applicationQuery(): SelectQueryBuilder<RenewalApplication> {
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
        'application.submittedAt',
        'application.reviewStartedAt',
        'application.readyForInspectionAt',
        'application.completedAt',
        'application.cancelledAt',
        'application.cancellationReason',
        'application.applicantSnapshot',
        'application.vehicleSnapshot',
        'application.createdAt',
        'application.updatedAt',
      ]);
  }

  private async findSubmittedApplication(
    applicationId: string,
  ): Promise<RenewalApplication> {
    const application = await this.applicationQuery()
      .where('application.id = :applicationId', { applicationId })
      .andWhere('application.submittedAt IS NOT NULL')
      .getOne();

    if (application === null) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }

    return application;
  }

  private sortColumn(sortBy: AdminApplicationSortField): string {
    return sortBy === 'createdAt'
      ? 'application.createdAt'
      : 'application.submittedAt';
  }
}

function cambodiaDayStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, -7));
}

function cambodiaNextDayStart(value: string): Date {
  const date = cambodiaDayStart(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

interface AdminApplicationQueueListResult {
  data: AdminApplicationQueueResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}

interface AdminApplicationStatusHistoryListResult {
  data: RenewalApplicationStatusHistoryResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}
