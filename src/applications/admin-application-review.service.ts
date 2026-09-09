import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { AuditLog } from '../activity/entities/audit-log.entity';
import { ApplicationTimelineEvent } from '../activity/entities/application-timeline-event.entity';
import { AuditActorType } from '../activity/enums/audit-actor-type.enum';
import { TimelineEventType } from '../activity/enums/timeline-event-type.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Sticker } from '../stickers/entities/sticker.entity';
import {
  mapAdminApplicationDetail,
  type AdminApplicationDetailResponse,
} from './admin-application-response.mapper';
import { RequestApplicationCorrectionDto } from './dto/request-application-correction.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';
import { ReopenApplicationDto } from './dto/reopen-application.dto';
import { ApplicationDocument } from './entities/application-document.entity';
import { RenewalApplicationStatusHistory } from './entities/renewal-application-status-history.entity';
import { RenewalApplication } from './entities/renewal-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentType } from './enums/document-type.enum';
import { expireInitialApplicationIfDue } from './initial-application-expiry';

const INITIAL_APPLICATION_EXPIRED = Symbol('INITIAL_APPLICATION_EXPIRED');

@Injectable()
export class AdminApplicationReviewService {
  constructor(private readonly dataSource: DataSource) {}

  async startReview(
    adminId: string,
    applicationId: string,
  ): Promise<AdminApplicationDetailResponse> {
    return this.executeInitialPeriodMutation((manager) =>
      this.startReviewWithManager(manager, adminId, applicationId),
    );
  }

  async requestCorrection(
    adminId: string,
    applicationId: string,
    input: RequestApplicationCorrectionDto,
  ): Promise<AdminApplicationDetailResponse> {
    return this.executeInitialPeriodMutation((manager) =>
      this.requestCorrectionWithManager(manager, adminId, applicationId, input),
    );
  }

  async reject(
    adminId: string,
    applicationId: string,
    input: RejectApplicationDto,
  ): Promise<AdminApplicationDetailResponse> {
    return this.executeInitialPeriodMutation((manager) =>
      this.rejectWithManager(manager, adminId, applicationId, input.reason),
    );
  }

  async reopen(
    adminId: string,
    applicationId: string,
    input: ReopenApplicationDto,
  ): Promise<AdminApplicationDetailResponse> {
    return this.executeInitialPeriodMutation((manager) =>
      this.reopenWithManager(manager, adminId, applicationId, input.reason),
    );
  }

  async passReview(
    adminId: string,
    applicationId: string,
  ): Promise<AdminApplicationDetailResponse> {
    return this.executeInitialPeriodMutation((manager) =>
      this.passReviewWithManager(manager, adminId, applicationId),
    );
  }

  private async startReviewWithManager(
    manager: EntityManager,
    adminId: string,
    applicationId: string,
  ): Promise<
    AdminApplicationDetailResponse | typeof INITIAL_APPLICATION_EXPIRED
  > {
    const application = await this.lockSubmittedApplication(
      manager,
      applicationId,
    );
    if (
      application.status !== ApplicationStatus.APPROVED ||
      application.readyForInspectionAt === null
    ) {
      throw this.invalidTransition();
    }

    const now = new Date();
    if (await expireInitialApplicationIfDue(manager, application, now)) {
      return INITIAL_APPLICATION_EXPIRED;
    }
    await this.assertPostStickerPrerequisites(
      manager,
      application,
      applicationId,
    );
    if (await this.documentsApprovedEvent(manager, applicationId)) {
      throw this.invalidTransition();
    }
    application.status = ApplicationStatus.UNDER_REVIEW;
    application.reviewStartedAt ??= now;
    application.currentCorrectionReason = null;
    application.currentRejectionReason = null;
    await manager.getRepository(RenewalApplication).save(application);
    await this.writeHistory(
      manager,
      application.id,
      ApplicationStatus.APPROVED,
      ApplicationStatus.UNDER_REVIEW,
      adminId,
    );
    return mapAdminApplicationDetail(application);
  }

  private async requestCorrectionWithManager(
    manager: EntityManager,
    adminId: string,
    applicationId: string,
    input: RequestApplicationCorrectionDto,
  ): Promise<
    AdminApplicationDetailResponse | typeof INITIAL_APPLICATION_EXPIRED
  > {
    const application = await this.lockSubmittedApplication(
      manager,
      applicationId,
    );
    if (application.status !== ApplicationStatus.UNDER_REVIEW) {
      throw this.invalidTransition();
    }
    const now = new Date();
    if (await expireInitialApplicationIfDue(manager, application, now)) {
      return INITIAL_APPLICATION_EXPIRED;
    }
    await this.assertPostStickerPrerequisites(
      manager,
      application,
      applicationId,
    );

    const documents = await manager.getRepository(ApplicationDocument).find({
      where: { applicationId, isCurrent: true },
    });
    const currentByType = new Map<DocumentType, ApplicationDocument[]>();
    for (const document of documents) {
      const current = currentByType.get(document.documentType) ?? [];
      current.push(document);
      currentByType.set(document.documentType, current);
    }
    if (
      Object.values(DocumentType).some(
        (documentType) => currentByType.get(documentType)?.length !== 1,
      )
    ) {
      throw new DomainException(
        ApiErrorCode.REQUIRED_DOCUMENTS_MISSING,
        HttpStatus.CONFLICT,
        'Required documents are missing',
      );
    }

    const selected = new Set(input.documentTypes);
    for (const document of documents) {
      const rejected = selected.has(document.documentType);
      document.status = rejected
        ? DocumentStatus.REJECTED
        : DocumentStatus.APPROVED;
      document.rejectionReason = rejected ? input.reason : null;
      document.reviewedByUserId = adminId;
      document.reviewedAt = now;
    }
    await manager.getRepository(ApplicationDocument).save(documents);

    application.status = ApplicationStatus.CORRECTION_REQUIRED;
    application.currentCorrectionReason = input.reason;
    application.currentRejectionReason = null;
    await manager.getRepository(RenewalApplication).save(application);
    await this.writeHistory(
      manager,
      application.id,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.CORRECTION_REQUIRED,
      adminId,
    );
    return mapAdminApplicationDetail(application);
  }

  private async rejectWithManager(
    manager: EntityManager,
    adminId: string,
    applicationId: string,
    reason: string,
  ): Promise<
    AdminApplicationDetailResponse | typeof INITIAL_APPLICATION_EXPIRED
  > {
    const application = await this.lockSubmittedApplication(
      manager,
      applicationId,
    );
    if (application.status !== ApplicationStatus.UNDER_REVIEW) {
      throw this.invalidTransition();
    }
    if (await expireInitialApplicationIfDue(manager, application, new Date())) {
      return INITIAL_APPLICATION_EXPIRED;
    }
    await this.assertPostStickerPrerequisites(
      manager,
      application,
      applicationId,
    );
    application.status = ApplicationStatus.REJECTED;
    application.currentCorrectionReason = null;
    application.currentRejectionReason = reason;
    await manager.getRepository(RenewalApplication).save(application);
    await this.writeHistory(
      manager,
      application.id,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.REJECTED,
      adminId,
    );
    await this.writeAudit(manager, {
      actorUserId: adminId,
      applicationId: application.id,
      action: 'APPLICATION_REJECTED',
      description: 'Administrator rejected a renewal application.',
      oldValues: {
        status: ApplicationStatus.UNDER_REVIEW,
        currentRejectionReason: null,
      },
      newValues: {
        status: ApplicationStatus.REJECTED,
        currentRejectionReason: reason,
      },
    });
    return mapAdminApplicationDetail(application);
  }

  private async reopenWithManager(
    manager: EntityManager,
    adminId: string,
    applicationId: string,
    reason: string,
  ): Promise<
    AdminApplicationDetailResponse | typeof INITIAL_APPLICATION_EXPIRED
  > {
    const application = await this.lockSubmittedApplication(
      manager,
      applicationId,
    );
    if (application.status !== ApplicationStatus.REJECTED) {
      throw this.invalidTransition();
    }
    if (await expireInitialApplicationIfDue(manager, application, new Date())) {
      return INITIAL_APPLICATION_EXPIRED;
    }
    await this.assertPostStickerPrerequisites(
      manager,
      application,
      applicationId,
    );
    const previousRejectionReason = application.currentRejectionReason;
    application.status = ApplicationStatus.UNDER_REVIEW;
    application.currentRejectionReason = null;
    await manager.getRepository(RenewalApplication).save(application);
    await this.writeHistory(
      manager,
      application.id,
      ApplicationStatus.REJECTED,
      ApplicationStatus.UNDER_REVIEW,
      adminId,
    );
    await this.writeAudit(manager, {
      actorUserId: adminId,
      applicationId: application.id,
      action: 'APPLICATION_REOPENED',
      description: 'Administrator reopened a rejected renewal application.',
      oldValues: {
        status: ApplicationStatus.REJECTED,
        currentRejectionReason: previousRejectionReason,
      },
      newValues: {
        status: ApplicationStatus.UNDER_REVIEW,
        currentRejectionReason: null,
        reopenReason: reason,
      },
    });
    return mapAdminApplicationDetail(application);
  }

  private async passReviewWithManager(
    manager: EntityManager,
    adminId: string,
    applicationId: string,
  ): Promise<
    AdminApplicationDetailResponse | typeof INITIAL_APPLICATION_EXPIRED
  > {
    const application = await this.lockSubmittedApplication(
      manager,
      applicationId,
    );
    if (application.status !== ApplicationStatus.UNDER_REVIEW) {
      throw this.invalidTransition();
    }
    const approvalTimestamp = await this.currentTimestamp(manager);
    if (
      await expireInitialApplicationIfDue(
        manager,
        application,
        approvalTimestamp,
      )
    ) {
      return INITIAL_APPLICATION_EXPIRED;
    }
    await this.assertPostStickerPrerequisites(
      manager,
      application,
      applicationId,
    );
    if (await this.documentsApprovedEvent(manager, applicationId)) {
      throw this.invalidTransition();
    }
    const documents = await manager.getRepository(ApplicationDocument).find({
      where: { applicationId, isCurrent: true },
    });
    const requiredTypes = Object.values(DocumentType);
    if (
      requiredTypes.some(
        (documentType) =>
          documents.filter((document) => document.documentType === documentType)
            .length !== 1,
      ) ||
      documents.some((document) => document.status === DocumentStatus.REJECTED)
    ) {
      throw this.invalidTransition();
    }
    for (const document of documents) {
      document.status = DocumentStatus.APPROVED;
      document.rejectionReason = null;
      document.reviewedByUserId = adminId;
      document.reviewedAt = approvalTimestamp;
    }
    await manager.getRepository(ApplicationDocument).save(documents);
    application.status = ApplicationStatus.APPROVED;
    await manager.getRepository(RenewalApplication).save(application);
    await this.writeHistory(
      manager,
      application.id,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.APPROVED,
      adminId,
    );
    const events = manager.getRepository(ApplicationTimelineEvent);
    await events.save(
      events.create({
        applicationId,
        eventType: TimelineEventType.DOCUMENTS_APPROVED,
        title: 'Documents approved',
        message: null,
        actorUserId: adminId,
        visibleToCitizen: true,
        metadata: null,
        occurredAt: approvalTimestamp,
      }),
    );
    return mapAdminApplicationDetail(application);
  }

  private async assertPostStickerPrerequisites(
    manager: EntityManager,
    application: RenewalApplication,
    applicationId: string,
  ): Promise<void> {
    if (application.readyForInspectionAt === null) {
      throw this.invalidTransition();
    }
    const payment = await manager.getRepository(Payment).findOne({
      where: { applicationId },
    });
    if (payment?.status !== PaymentStatus.CONFIRMED) {
      throw this.invalidTransition();
    }
    const pass = await manager.getRepository(Inspection).findOne({
      where: {
        applicationId,
        attemptNumber: 1,
        status: InspectionStatus.COMPLETED,
        result: InspectionResult.PASS,
      },
    });
    if (pass === null || pass.completedAt === null) {
      throw this.invalidTransition();
    }
    const sticker = await manager.getRepository(Sticker).findOne({
      where: { applicationId, inspectionId: pass.id },
    });
    if (sticker === null || sticker.issuedAt === null) {
      throw this.invalidTransition();
    }
  }

  private async documentsApprovedEvent(
    manager: EntityManager,
    applicationId: string,
  ): Promise<ApplicationTimelineEvent | null> {
    return manager.getRepository(ApplicationTimelineEvent).findOne({
      where: {
        applicationId,
        eventType: TimelineEventType.DOCUMENTS_APPROVED,
      },
    });
  }

  private async currentTimestamp(manager: EntityManager): Promise<Date> {
    const [timestamp] = await manager.query<Array<{ now: Date }>>(
      'SELECT now() AS "now"',
    );
    if (timestamp === undefined) {
      throw new Error('Document approval timestamp unavailable');
    }
    return timestamp.now;
  }

  private async lockSubmittedApplication(
    manager: EntityManager,
    applicationId: string,
  ): Promise<RenewalApplication> {
    const application = await manager
      .getRepository(RenewalApplication)
      .findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
    if (application === null || application.submittedAt === null) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Renewal application not found',
      );
    }
    return application;
  }

  private async executeInitialPeriodMutation(
    operation: (
      manager: EntityManager,
    ) => Promise<
      AdminApplicationDetailResponse | typeof INITIAL_APPLICATION_EXPIRED
    >,
  ): Promise<AdminApplicationDetailResponse> {
    const result = await this.dataSource.transaction(operation);
    if (result === INITIAL_APPLICATION_EXPIRED) throw this.invalidTransition();
    return result;
  }

  private async writeHistory(
    manager: EntityManager,
    applicationId: string,
    previousStatus: ApplicationStatus,
    newStatus: ApplicationStatus,
    adminId: string,
  ): Promise<void> {
    const history = manager.getRepository(RenewalApplicationStatusHistory);
    await history.save(
      history.create({
        applicationId,
        previousStatus,
        newStatus,
        changedByUserId: adminId,
      }),
    );
  }

  private async writeAudit(
    manager: EntityManager,
    input: {
      actorUserId: string;
      applicationId: string;
      action: 'APPLICATION_REJECTED' | 'APPLICATION_REOPENED';
      description: string;
      oldValues: Record<string, unknown>;
      newValues: Record<string, unknown>;
    },
  ): Promise<void> {
    const audits = manager.getRepository(AuditLog);
    await audits.save(
      audits.create({
        actorType: AuditActorType.USER,
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
        action: input.action,
        entityType: 'RENEWAL_APPLICATION',
        entityId: input.applicationId,
        description: input.description,
        oldValues: input.oldValues,
        newValues: input.newValues,
        ipAddress: null,
        userAgent: null,
      }),
    );
  }

  private invalidTransition(): DomainException {
    return new DomainException(
      ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'Application transition is invalid',
    );
  }
}
