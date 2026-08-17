import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { IssueStickerDto } from './dto/issue-sticker.dto';
import { Sticker } from './entities/sticker.entity';
import { StickerReadsService } from './sticker-reads.service';
import type { StickerDetailResponse } from './sticker-response.mapper';

@Injectable()
export class StickerCommandsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reads: StickerReadsService,
  ) {}

  async issue(
    applicationId: string,
    adminUserId: string,
    input: IssueStickerDto,
  ): Promise<StickerDetailResponse> {
    try {
      await this.dataSource.transaction((manager) =>
        this.issueWithManager(manager, applicationId, adminUserId, input),
      );
    } catch (error) {
      this.mapConflict(error);
    }
    return this.reads.getAdminDetail(applicationId);
  }

  private async issueWithManager(
    manager: EntityManager,
    applicationId: string,
    adminUserId: string,
    input: IssueStickerDto,
  ): Promise<void> {
    const application = await manager
      .getRepository(RenewalApplication)
      .createQueryBuilder('application')
      .setLock('pessimistic_write')
      .where('application.id = :applicationId', { applicationId })
      .getOne();
    if (application === null) throw this.notFound();
    if (application.status !== ApplicationStatus.APPROVED)
      throw this.ineligible();
    const passes = await manager.getRepository(Inspection).find({
      where: {
        applicationId,
        status: InspectionStatus.COMPLETED,
        result: InspectionResult.PASS,
      },
    });
    if (passes.length !== 1) {
      if (passes.length > 1)
        throw new DomainException(
          ApiErrorCode.INSPECTION_INVALID_TRANSITION,
          HttpStatus.CONFLICT,
          'Application has inconsistent completed PASS inspections',
        );
      throw this.ineligible();
    }
    const pass = passes[0];
    const appointment = await manager
      .getRepository(Appointment)
      .findOne({ where: { id: pass.appointmentId } });
    if (appointment === null || appointment.dailyCapacityId === null)
      throw this.ineligible();
    const stickers = manager.getRepository(Sticker);
    if (
      (await stickers.exists({ where: { applicationId } })) ||
      (await stickers.exists({ where: { inspectionId: pass.id } }))
    )
      throw this.alreadyIssued();
    const [clock] = await manager.query<Array<{ now: Date }>>(
      'SELECT now() AS "now"',
    );
    const issuedAt = clock.now;
    await stickers.save(
      stickers.create({
        applicationId,
        inspectionId: pass.id,
        stickerNumber: input.stickerNumber,
        issuedAt,
        issuedByUserId: adminUserId,
      }),
    );
    application.status = ApplicationStatus.COMPLETED;
    application.completedAt = issuedAt;
    await manager.getRepository(RenewalApplication).save(application);
    await manager.getRepository(RenewalApplicationStatusHistory).save({
      applicationId,
      previousStatus: ApplicationStatus.APPROVED,
      newStatus: ApplicationStatus.COMPLETED,
      changedByUserId: adminUserId,
      reason: 'STICKER_ISSUED',
    });
  }

  private mapConflict(error: unknown): never {
    if (error instanceof DomainException) throw error;
    if (error instanceof QueryFailedError) {
      const driver = error.driverError as {
        code?: string;
        constraint?: string;
      };
      if (
        driver.code === '23505' &&
        driver.constraint === 'uq_stickers_sticker_number'
      )
        throw new DomainException(
          ApiErrorCode.STICKER_NUMBER_CONFLICT,
          HttpStatus.CONFLICT,
          'Sticker number is already in use',
        );
      if (
        driver.code === '23505' &&
        ['uq_stickers_application', 'uq_stickers_inspection'].includes(
          driver.constraint ?? '',
        )
      )
        throw this.alreadyIssued();
    }
    if (error instanceof Error) throw error;
    throw new DomainException(
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Sticker issuance failed',
    );
  }
  private notFound() {
    return new DomainException(
      ApiErrorCode.APPLICATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Application not found',
    );
  }
  private ineligible() {
    return new DomainException(
      ApiErrorCode.STICKER_PASS_INSPECTION_REQUIRED,
      HttpStatus.CONFLICT,
      'Application is not eligible for sticker issuance',
    );
  }
  private alreadyIssued() {
    return new DomainException(
      ApiErrorCode.STICKER_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'Sticker has already been issued for this application',
    );
  }
}
