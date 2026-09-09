import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { DataSource, type EntityManager, type Repository } from 'typeorm';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { ApplicationDocument } from '../applications/entities/application-document.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { DocumentStatus } from '../applications/enums/document-status.enum';
import { DocumentType } from '../applications/enums/document-type.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { createPaginationMeta } from '../common/pagination/pagination-meta';
import { FilesService } from '../files/files.service';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { CitizenPreferredSchedulingService } from '../scheduling/citizen-preferred-scheduling.service';
import { CitizenProfile } from '../users/entities/citizen-profile.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleClass } from '../vehicles/enums/vehicle-class.enum';
import {
  type AdminPaymentSortField,
  type ListAdminPaymentsQueryDto,
} from './dto/payment-request.dtos';
import { Payment } from './entities/payment.entity';
import { PaymentStatusHistory } from './entities/payment-status-history.entity';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import {
  mapAdminPayment,
  mapPayment,
  type AdminPaymentResponse,
  type PaymentResponse,
} from './payment-response.mapper';
import {
  mapPaymentStatusHistory,
  type PaymentStatusHistoryResponse,
} from './payment-status-history-response.mapper';
import { PaymentPdfService } from './payment-pdf.service';
import { inspectionPolicy } from '../config/inspection-policy';
import { maximumChargeableLateDays } from './late-penalty-policy';
import { expireInitialApplicationIfDue } from '../applications/initial-application-expiry';

const PAYMENT_CURRENCY = 'KHR';
const CITIZEN_SERVICE_FEE_KHR = '0.00';
const MAX_INVOICE_NUMBER_ATTEMPTS = 3;
const MAX_RECEIPT_NUMBER_ATTEMPTS = 3;
const INITIAL_APPLICATION_EXPIRED = Symbol('INITIAL_APPLICATION_EXPIRED');

export interface CitizenFeeEstimateResponse {
  inspectionFeeKhr: string;
  serviceFeeKhr: string;
  baseAmount: string;
  lateDays: number;
  lateFee: string;
  totalAmount: string;
  currency: string;
}

export interface CitizenPaymentInvoiceResponse extends PaymentResponse {
  applicationReferenceNumber: string | null;
  preferredInspectionStationId: string | null;
  preferredInspectionDate: string | null;
  vehicle: {
    registrationNumber: string;
    plateNumber: string;
    plateCategory: string;
    plateProvince: string | null;
    plateType: string;
    make: string;
    model: string;
    manufactureYear: number | null;
    chassisNumber: string;
  };
  applicant: {
    nameKh: string | null;
    nameEn: string | null;
    phone: string | null;
  };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(PaymentStatusHistory)
    private readonly statusHistory: Repository<PaymentStatusHistory>,
    @InjectRepository(RenewalApplication)
    private readonly applications: Repository<RenewalApplication>,
    private readonly files: FilesService,
    private readonly paymentPdf: PaymentPdfService,
    private readonly preferredScheduling: CitizenPreferredSchedulingService,
  ) {}

  async initializePayment(applicationId: string): Promise<Payment> {
    return this.initializePaymentForApplication(applicationId);
  }

  async initializeCitizenDraftPayment(
    citizenId: string,
    applicationId: string,
  ): Promise<CitizenPaymentInvoiceResponse> {
    const payment = await this.initializePaymentForApplication(
      applicationId,
      citizenId,
    );

    return this.citizenPaymentInvoiceResponse(
      citizenId,
      applicationId,
      payment,
    );
  }

  private async initializePaymentForApplication(
    applicationId: string,
    citizenId?: string,
  ): Promise<Payment> {
    for (let attempt = 0; attempt < MAX_INVOICE_NUMBER_ATTEMPTS; attempt++) {
      let invoiceFileKey: string | null = null;

      try {
        const result = await this.dataSource.transaction(async (manager) => {
          const application = await manager
            .getRepository(RenewalApplication)
            .findOne({
              where: { id: applicationId },
              lock: { mode: 'pessimistic_write' },
            });

          if (application === null) {
            throw this.applicationNotFound();
          }

          if (citizenId !== undefined) {
            if (application.citizenId !== citizenId) throw this.notOwned();
            this.assertDraft(application);
          }

          const payments = manager.getRepository(Payment);
          const existing = await payments.findOne({
            where: { applicationId: application.id },
          });
          if (existing !== null) {
            if (citizenId !== undefined) {
              this.assertPendingStationPayment(existing);
            }
            return existing;
          }

          // Citizen invoices are created while DRAFT, before submittedAt
          // exists. Guard the legacy approved-application initializer so it
          // cannot create a new charge during the scheduler's hourly lag.
          if (
            citizenId === undefined &&
            (await expireInitialApplicationIfDue(
              manager,
              application,
              new Date(),
            ))
          ) {
            return INITIAL_APPLICATION_EXPIRED;
          }

          if (citizenId === undefined) {
            this.assertApproved(application);
            await this.assertExactlyOneScheduledAppointment(
              manager,
              application.id,
            );
          } else {
            await this.assertCitizenDraftReady(manager, application);
          }
          const vehicle = await this.loadVehicle(
            manager,
            application.vehicleId,
          );
          if (
            citizenId !== undefined &&
            vehicle.linkedCitizenId !== citizenId
          ) {
            throw this.notOwned();
          }
          const category = await this.loadActiveCategory(manager, vehicle);
          const snapshot = await this.calculateSnapshot(
            manager,
            vehicle.inspectionExpiryDate,
            vehicle.vehicleClass,
            category.inspectionFeeKhr,
            CITIZEN_SERVICE_FEE_KHR,
          );
          const invoiceNumber = this.generateInvoiceNumber(
            snapshot.paymentDate,
          );
          const invoice = await this.paymentPdf.generateInvoice({
            invoiceNumber,
            issuedDate: snapshot.paymentDate,
            applicationReferenceNumber: application.referenceNumber,
            vehiclePlate: vehicle.plateNumber,
            vehicleMakeModel: `${vehicle.make} ${vehicle.model}`,
            previousInspectionExpiryDate: vehicle.inspectionExpiryDate,
            inspectionFeeKhr: snapshot.inspectionFeeKhr,
            serviceFeeKhr: snapshot.serviceFeeKhr,
            baseAmount: snapshot.baseAmount,
            lateDays: snapshot.lateDays,
            lateFee: snapshot.lateFee,
            totalAmount: snapshot.totalAmount,
            currency: PAYMENT_CURRENCY,
          });
          const storedInvoice = await this.files.savePaymentArtifact(
            application.id,
            'invoice',
            invoice,
          );
          invoiceFileKey = storedInvoice.storageKey;

          return payments.save(
            payments.create({
              applicationId: application.id,
              invoiceNumber,
              receiptNumber: null,
              method: PaymentMethod.PAY_AT_STATION,
              status: PaymentStatus.PENDING,
              inspectionFeeKhr: snapshot.inspectionFeeKhr,
              serviceFeeKhr: snapshot.serviceFeeKhr,
              baseAmount: snapshot.baseAmount,
              previousInspectionExpiryDate: vehicle.inspectionExpiryDate,
              lateDays: snapshot.lateDays,
              lateFee: snapshot.lateFee,
              totalAmount: snapshot.totalAmount,
              currency: PAYMENT_CURRENCY,
              paymentReference: null,
              providerName: null,
              providerTransactionId: null,
              confirmedByUserId: null,
              confirmedAt: null,
              failedAt: null,
              failureReason: null,
              rejectedAt: null,
              rejectedByUserId: null,
              rejectionReason: null,
              invoiceIssuedAt: snapshot.invoiceIssuedAt,
              invoiceFileKey,
              receiptFileKey: null,
              inspectionSheetFileKey: null,
            }),
          );
        });
        if (result === INITIAL_APPLICATION_EXPIRED) {
          throw new DomainException(
            ApiErrorCode.APPLICATION_INVALID_TRANSITION,
            HttpStatus.CONFLICT,
            'The application has expired',
          );
        }
        return result;
      } catch (error) {
        if (invoiceFileKey !== null) {
          await this.deleteInvoiceAfterFailedInitialization(invoiceFileKey);
        }

        const existing = await this.existingPaymentAfterUniqueConflict(
          error,
          applicationId,
        );
        if (existing !== null) {
          return existing;
        }
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    throw new DomainException(
      ApiErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      'Could not generate a unique invoice number',
    );
  }

  async confirmPayment(
    paymentId: string,
    actorUserId: string,
    input?: { paymentReference?: string },
  ): Promise<AdminPaymentResponse> {
    for (let attempt = 0; attempt < MAX_RECEIPT_NUMBER_ATTEMPTS; attempt++) {
      const artifactKeys: string[] = [];

      try {
        const result = await this.dataSource.transaction(async (manager) => {
          const payment = await this.lockedPayment(manager, paymentId);
          this.assertTransition(payment.status, [
            PaymentStatus.PENDING,
            PaymentStatus.REJECTED,
          ]);
          const application = await manager
            .getRepository(RenewalApplication)
            .findOne({
              where: { id: payment.applicationId },
              lock: { mode: 'pessimistic_write' },
            });
          if (application === null) throw this.applicationNotFound();
          const { confirmedAt, confirmationDate } =
            await this.confirmationTimestamp(manager);
          if (
            await expireInitialApplicationIfDue(
              manager,
              application,
              confirmedAt,
            )
          ) {
            return INITIAL_APPLICATION_EXPIRED;
          }
          this.assertApplicationConfirmable(application);
          const vehicle = await this.loadVehicle(
            manager,
            application.vehicleId,
          );
          const receiptNumber = generateReceiptNumber(confirmationDate);
          const paymentReference =
            input?.paymentReference === undefined
              ? payment.paymentReference
              : input.paymentReference.trim();
          const receipt = await this.paymentPdf.generateReceipt({
            receiptNumber,
            invoiceNumber: payment.invoiceNumber,
            confirmedDate: confirmationDate,
            applicationReferenceNumber: this.applicationReference(application),
            vehiclePlate: vehicle.plateNumber,
            vehicleMakeModel: `${vehicle.make} ${vehicle.model}`,
            inspectionFeeKhr: payment.inspectionFeeKhr,
            serviceFeeKhr: payment.serviceFeeKhr,
            baseAmount: payment.baseAmount,
            lateDays: payment.lateDays,
            lateFee: payment.lateFee,
            totalAmount: payment.totalAmount,
            currency: payment.currency,
            paymentReference,
          });
          const inspectionSheet = await this.paymentPdf.generateInspectionSheet(
            {
              receiptNumber,
              applicationReferenceNumber:
                this.applicationReference(application),
              vehiclePlate: vehicle.plateNumber,
              vehicleMakeModel: `${vehicle.make} ${vehicle.model}`,
              vehicleClass: vehicle.vehicleClass,
            },
          );
          const receiptArtifact = await this.files.savePaymentArtifact(
            payment.applicationId,
            'receipt',
            receipt,
          );
          artifactKeys.push(receiptArtifact.storageKey);
          const inspectionSheetArtifact = await this.files.savePaymentArtifact(
            payment.applicationId,
            'inspection-sheet',
            inspectionSheet,
          );
          artifactKeys.push(inspectionSheetArtifact.storageKey);

          const previousStatus = payment.status;
          payment.status = PaymentStatus.CONFIRMED;
          payment.confirmedByUserId = actorUserId;
          payment.confirmedAt = confirmedAt;
          payment.receiptNumber = receiptNumber;
          payment.receiptFileKey = receiptArtifact.storageKey;
          payment.inspectionSheetFileKey = inspectionSheetArtifact.storageKey;
          if (input?.paymentReference !== undefined) {
            payment.paymentReference = paymentReference;
          }
          await manager.getRepository(Payment).save(payment);
          application.status = ApplicationStatus.APPROVED;
          application.readyForInspectionAt = confirmedAt;
          await manager.getRepository(RenewalApplication).save(application);
          await this.addStatusHistory(
            manager,
            payment.id,
            previousStatus,
            PaymentStatus.CONFIRMED,
            actorUserId,
            null,
          );
          await this.addApplicationStatusHistory(
            manager,
            application.id,
            actorUserId,
          );
          return mapAdminPayment(payment);
        });
        if (result === INITIAL_APPLICATION_EXPIRED) {
          throw new DomainException(
            ApiErrorCode.APPLICATION_INVALID_TRANSITION,
            HttpStatus.CONFLICT,
            'The application has expired',
          );
        }
        return result;
      } catch (error) {
        await this.deleteArtifactsAfterFailedTransition(artifactKeys);
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    throw new DomainException(
      ApiErrorCode.PAYMENT_RECEIPT_NUMBER_CONFLICT,
      HttpStatus.CONFLICT,
      'Could not generate a unique receipt number',
    );
  }

  async rejectPayment(
    paymentId: string,
    actorUserId: string,
    reason: string,
  ): Promise<AdminPaymentResponse> {
    const trimmedReason = this.requiredTransitionReason(reason);
    return this.dataSource.transaction(async (manager) => {
      const payment = await this.lockedPayment(manager, paymentId);
      this.assertTransition(payment.status, [PaymentStatus.PENDING]);
      const previousStatus = payment.status;
      payment.status = PaymentStatus.REJECTED;
      payment.rejectedByUserId = actorUserId;
      payment.rejectedAt = new Date();
      payment.rejectionReason = trimmedReason;
      await manager.getRepository(Payment).save(payment);
      await this.addStatusHistory(
        manager,
        payment.id,
        previousStatus,
        PaymentStatus.REJECTED,
        actorUserId,
        trimmedReason,
      );
      return mapAdminPayment(payment);
    });
  }

  async reopenPayment(
    paymentId: string,
    actorUserId: string,
    reason: string,
  ): Promise<AdminPaymentResponse> {
    const trimmedReason = this.requiredTransitionReason(reason);
    return this.dataSource.transaction(async (manager) => {
      const payment = await this.lockedPayment(manager, paymentId);
      this.assertTransition(payment.status, [PaymentStatus.REJECTED]);
      const previousStatus = payment.status;
      payment.status = PaymentStatus.PENDING;
      await manager.getRepository(Payment).save(payment);
      await this.addStatusHistory(
        manager,
        payment.id,
        previousStatus,
        PaymentStatus.PENDING,
        actorUserId,
        trimmedReason,
      );
      return mapAdminPayment(payment);
    });
  }

  async getCitizenPayment(
    citizenId: string,
    applicationId: string,
  ): Promise<PaymentResponse> {
    const application = await this.applications.findOne({
      where: { id: applicationId },
    });

    if (application === null) {
      throw this.applicationNotFound();
    }

    if (application.citizenId !== citizenId) {
      throw this.notOwned();
    }

    const payment = await this.payments.findOne({ where: { applicationId } });

    if (payment === null) {
      throw this.paymentNotFound();
    }

    return mapPayment(payment);
  }

  async getCitizenFeeEstimate(
    citizenId: string,
    applicationId: string,
  ): Promise<CitizenFeeEstimateResponse> {
    return this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(RenewalApplication)
        .findOne({ where: { id: applicationId } });
      if (application === null) throw this.applicationNotFound();
      if (application.citizenId !== citizenId) throw this.notOwned();
      if (application.status !== ApplicationStatus.DRAFT) {
        throw new DomainException(
          ApiErrorCode.APPLICATION_INVALID_TRANSITION,
          HttpStatus.CONFLICT,
          'Fee estimation is only available for draft applications',
        );
      }

      const vehicle = await this.loadVehicle(manager, application.vehicleId);
      const category = await this.loadActiveCategory(manager, vehicle);
      const snapshot = await this.calculateSnapshot(
        manager,
        vehicle.inspectionExpiryDate,
        vehicle.vehicleClass,
        category.inspectionFeeKhr,
        CITIZEN_SERVICE_FEE_KHR,
      );

      return {
        inspectionFeeKhr: snapshot.inspectionFeeKhr,
        serviceFeeKhr: snapshot.serviceFeeKhr,
        baseAmount: snapshot.baseAmount,
        lateDays: snapshot.lateDays,
        lateFee: snapshot.lateFee,
        totalAmount: snapshot.totalAmount,
        currency: PAYMENT_CURRENCY,
      };
    });
  }

  private async citizenPaymentInvoiceResponse(
    citizenId: string,
    applicationId: string,
    payment: Payment,
  ): Promise<CitizenPaymentInvoiceResponse> {
    return this.dataSource.transaction(async (manager) => {
      const application = await manager
        .getRepository(RenewalApplication)
        .findOne({ where: { id: applicationId } });
      if (application === null) throw this.applicationNotFound();
      if (application.citizenId !== citizenId) throw this.notOwned();

      const vehicle = await manager.getRepository(Vehicle).findOne({
        where: { id: application.vehicleId },
      });
      if (vehicle === null) {
        throw new DomainException(
          ApiErrorCode.VEHICLE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
          'Vehicle not found',
        );
      }

      const [user, profile] = await Promise.all([
        manager.getRepository(User).findOne({ where: { id: citizenId } }),
        manager
          .getRepository(CitizenProfile)
          .findOne({ where: { userId: citizenId } }),
      ]);

      return {
        ...mapPayment(payment),
        applicationReferenceNumber: application.referenceNumber,
        preferredInspectionStationId: application.preferredInspectionStationId,
        preferredInspectionDate: application.preferredInspectionDate,
        vehicle: {
          registrationNumber: vehicle.registrationNumber,
          plateNumber: vehicle.plateNumber,
          plateCategory: vehicle.plateCategory,
          plateProvince: vehicle.plateProvince,
          plateType: vehicle.plateType,
          make: vehicle.make,
          model: vehicle.model,
          manufactureYear: vehicle.manufactureYear,
          chassisNumber: vehicle.chassisNumber,
        },
        applicant: {
          nameKh: profile?.nameKh ?? null,
          nameEn: profile?.nameEn ?? null,
          phone: user?.phone ?? null,
        },
      };
    });
  }

  async listAdminPayments(
    input: ListAdminPaymentsQueryDto,
  ): Promise<AdminPaymentListResult> {
    const query = this.payments
      .createQueryBuilder('payment')
      .innerJoin('payment.application', 'application')
      .innerJoin('application.vehicle', 'vehicle');

    if (input.status !== undefined) {
      query.andWhere('payment.status = :status', { status: input.status });
    }

    if (input.method !== undefined) {
      query.andWhere('payment.method = :method', { method: input.method });
    }

    if (input.search !== undefined) {
      query.andWhere(
        '(payment.invoiceNumber ILIKE :search OR payment.receiptNumber ILIKE :search OR payment.paymentReference ILIKE :search OR application.referenceNumber ILIKE :search OR vehicle.plateNumber ILIKE :search)',
        { search: `%${input.search}%` },
      );
    }

    const order = input.sortOrder.toUpperCase() as 'ASC' | 'DESC';
    const [payments, total] = await query
      .orderBy(this.sortColumn(input.sortBy), order)
      .addOrderBy('payment.id', order)
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      data: payments.map(mapAdminPayment),
      meta: createPaginationMeta(input.page, input.limit, total),
    };
  }

  async getAdminPayment(paymentId: string): Promise<AdminPaymentResponse> {
    return mapAdminPayment(await this.findPayment(paymentId));
  }

  async getPaymentStatusHistory(
    paymentId: string,
  ): Promise<PaymentStatusHistoryResponse[]> {
    await this.findPayment(paymentId);

    const history = await this.statusHistory.find({
      where: { paymentId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return history.map(mapPaymentStatusHistory);
  }

  private async findPayment(paymentId: string): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });

    if (payment === null) {
      throw this.paymentNotFound();
    }

    return payment;
  }

  private async lockedPayment(
    manager: EntityManager,
    paymentId: string,
  ): Promise<Payment> {
    const payment = await manager.getRepository(Payment).findOne({
      where: { id: paymentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (payment === null) throw this.paymentNotFound();
    return payment;
  }

  private assertTransition(
    currentStatus: PaymentStatus,
    allowedFrom: PaymentStatus[],
  ): void {
    if (!allowedFrom.includes(currentStatus)) {
      throw new DomainException(
        ApiErrorCode.PAYMENT_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Payment transition is invalid',
      );
    }
  }

  private requiredTransitionReason(reason: string): string {
    const trimmedReason = reason.trim();
    if (trimmedReason === '' || trimmedReason.length > 500) {
      throw new DomainException(
        ApiErrorCode.PAYMENT_REJECTION_REASON_REQUIRED,
        HttpStatus.BAD_REQUEST,
        'A payment rejection or reopen reason is required and must not exceed 500 characters',
      );
    }
    return trimmedReason;
  }

  private async addStatusHistory(
    manager: EntityManager,
    paymentId: string,
    fromStatus: PaymentStatus,
    toStatus: PaymentStatus,
    changedByUserId: string,
    reason: string | null,
  ): Promise<void> {
    const histories = manager.getRepository(PaymentStatusHistory);
    await histories.save(
      histories.create({
        paymentId,
        fromStatus,
        toStatus,
        changedByUserId,
        reason,
      }),
    );
  }

  private async addApplicationStatusHistory(
    manager: EntityManager,
    applicationId: string,
    changedByUserId: string,
  ): Promise<void> {
    const histories = manager.getRepository(RenewalApplicationStatusHistory);
    await histories.save(
      histories.create({
        applicationId,
        previousStatus: ApplicationStatus.SUBMITTED,
        newStatus: ApplicationStatus.APPROVED,
        changedByUserId,
        reason: 'PAYMENT_CONFIRMED',
      }),
    );
  }

  private async confirmationTimestamp(
    manager: EntityManager,
  ): Promise<ConfirmationTimestamp> {
    const [timestamp] = await manager.query<ConfirmationTimestamp[]>(`
      SELECT
        now() AS "confirmedAt",
        (now() AT TIME ZONE 'Asia/Phnom_Penh')::date::text AS "confirmationDate"
    `);
    if (timestamp === undefined) {
      throw new Error('Payment confirmation did not return a timestamp');
    }
    return timestamp;
  }

  private async deleteArtifactsAfterFailedTransition(
    artifactKeys: string[],
  ): Promise<void> {
    for (const artifactKey of artifactKeys) {
      try {
        await this.files.deleteIfExists(artifactKey);
      } catch (cleanupError) {
        this.logger.error(
          `Could not delete payment artifact after transition failure: ${artifactKey}`,
          cleanupError instanceof Error
            ? cleanupError.stack
            : String(cleanupError),
        );
      }
    }
  }

  private assertApproved(application: RenewalApplication): void {
    if (application.status !== ApplicationStatus.APPROVED) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Payment can only be initialized for an approved application',
      );
    }
  }

  private assertDraft(application: RenewalApplication): void {
    if (application.status !== ApplicationStatus.DRAFT) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Payment initialization is only available for draft applications',
      );
    }
  }

  private assertApplicationConfirmable(application: RenewalApplication): void {
    if (
      application.status !== ApplicationStatus.SUBMITTED ||
      application.submittedAt === null ||
      application.readyForInspectionAt !== null
    ) {
      throw new DomainException(
        ApiErrorCode.APPLICATION_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Payment confirmation requires a submitted application awaiting inspection readiness',
      );
    }
  }

  private assertPendingStationPayment(payment: Payment): void {
    if (
      payment.method !== PaymentMethod.PAY_AT_STATION ||
      payment.status !== PaymentStatus.PENDING
    ) {
      throw new DomainException(
        ApiErrorCode.PAYMENT_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'The existing payment is not a pending station payment',
      );
    }
  }

  private async assertCitizenDraftReady(
    manager: EntityManager,
    application: RenewalApplication,
  ): Promise<void> {
    const documents = await manager.getRepository(ApplicationDocument).find({
      where: { applicationId: application.id, isCurrent: true },
    });
    const requiredTypes = Object.values(DocumentType);
    if (
      requiredTypes.some(
        (type) => !documents.some((document) => document.documentType === type),
      )
    ) {
      throw new DomainException(
        ApiErrorCode.REQUIRED_DOCUMENTS_MISSING,
        HttpStatus.CONFLICT,
        'Required documents are missing',
      );
    }
    if (
      documents.some(
        (document) =>
          requiredTypes.includes(document.documentType) &&
          document.status === DocumentStatus.REJECTED,
      )
    ) {
      throw new DomainException(
        ApiErrorCode.REQUIRED_DOCUMENTS_NOT_READY,
        HttpStatus.CONFLICT,
        'Rejected required documents must be replaced before payment initialization',
      );
    }

    const [user, profile] = await Promise.all([
      manager
        .getRepository(User)
        .findOne({ where: { id: application.citizenId } }),
      manager
        .getRepository(CitizenProfile)
        .findOne({ where: { userId: application.citizenId } }),
    ]);
    if (user === null || profile === null) {
      throw new DomainException(
        ApiErrorCode.CITIZEN_PROFILE_REQUIRED,
        HttpStatus.CONFLICT,
        'Citizen profile is required before payment initialization',
      );
    }

    if (application.preferredInspectionDate === null) {
      throw this.invalidPaymentSource(
        'A preferred inspection date is required before payment initialization',
      );
    }
    await this.preferredScheduling.validatePreferredDate(
      application.preferredInspectionDate,
    );
    await this.preferredScheduling.validateOptionalStationWithManager(
      manager,
      application.preferredInspectionStationId,
    );
  }

  private async assertExactlyOneScheduledAppointment(
    manager: EntityManager,
    applicationId: string,
  ): Promise<void> {
    const appointments = await manager.getRepository(Appointment).find({
      where: { applicationId, status: AppointmentStatus.SCHEDULED },
    });

    if (appointments.length !== 1) {
      throw new DomainException(
        ApiErrorCode.APPOINTMENT_INVALID_TRANSITION,
        HttpStatus.CONFLICT,
        'Exactly one scheduled appointment is required before payment initialization',
      );
    }
  }

  private async loadVehicle(
    manager: EntityManager,
    vehicleId: string,
  ): Promise<Vehicle & { vehicleClass: VehicleClass }> {
    const vehicle = await manager.getRepository(Vehicle).findOne({
      where: { id: vehicleId },
    });

    if (vehicle === null) {
      throw new DomainException(
        ApiErrorCode.VEHICLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Vehicle not found',
      );
    }
    if (!isIsoCalendarDate(vehicle.inspectionExpiryDate)) {
      throw this.invalidPaymentSource(
        'Vehicle inspection expiry date is invalid',
      );
    }
    if (
      vehicle.vehicleClass !== VehicleClass.LIGHT &&
      vehicle.vehicleClass !== VehicleClass.HEAVY
    ) {
      throw new DomainException(
        ApiErrorCode.VEHICLE_CLASSIFICATION_INCOMPLETE,
        HttpStatus.CONFLICT,
        'Vehicle inspection classification is incomplete',
      );
    }

    return vehicle as Vehicle & { vehicleClass: VehicleClass };
  }

  private async loadActiveCategory(
    manager: EntityManager,
    vehicle: Vehicle,
  ): Promise<InspectionVehicleCategory> {
    if (vehicle.inspectionCategoryId === null) {
      throw this.invalidPaymentSource(
        'Vehicle inspection category is required for payment initialization',
      );
    }

    const category = await manager
      .getRepository(InspectionVehicleCategory)
      .findOne({ where: { id: vehicle.inspectionCategoryId } });

    if (category === null) {
      throw new DomainException(
        ApiErrorCode.INSPECTION_CATEGORY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Inspection category not found',
      );
    }
    if (!category.isActive) {
      throw new DomainException(
        ApiErrorCode.INSPECTION_CATEGORY_INACTIVE,
        HttpStatus.CONFLICT,
        'Inspection category is inactive',
      );
    }
    if (
      !isNonnegativeDecimal(category.inspectionFeeKhr) ||
      !isNonnegativeDecimal(category.serviceFeeKhr)
    ) {
      throw this.invalidPaymentSource(
        'Inspection category fee values are invalid',
      );
    }

    return category;
  }

  private async calculateSnapshot(
    manager: EntityManager,
    inspectionExpiryDate: string,
    vehicleClass: VehicleClass,
    inspectionFeeKhr: string,
    serviceFeeKhr: string,
  ): Promise<PaymentCalculationSnapshot> {
    const { latePenalty } = inspectionPolicy;
    const maximumLateDays = maximumChargeableLateDays(
      inspectionExpiryDate,
      latePenalty.maxPenaltyYears,
    );
    const [snapshot] = await manager.query<PaymentCalculationSnapshot[]>(
      `
        SELECT
          now() AS "invoiceIssuedAt",
          (now() AT TIME ZONE 'Asia/Phnom_Penh')::date::text AS "paymentDate",
          GREATEST(
            (now() AT TIME ZONE 'Asia/Phnom_Penh')::date - $1::date,
            0
          )::integer AS "lateDays",
          $2::numeric(12,2)::text AS "inspectionFeeKhr",
          $3::numeric(12,2)::text AS "serviceFeeKhr",
          ($2::numeric(12,2) + $3::numeric(12,2))::numeric(12,2)::text AS "baseAmount",
          (
            CASE
            WHEN GREATEST(
              (now() AT TIME ZONE 'Asia/Phnom_Penh')::date - $1::date,
              0
            ) <= $5::integer THEN 0
            WHEN $4::text = '${VehicleClass.LIGHT}' THEN
              GREATEST(
                LEAST(
                  GREATEST(
                    (now() AT TIME ZONE 'Asia/Phnom_Penh')::date - $1::date,
                    0
                  ),
                  $6::integer
                ) - $5::integer,
                0
              ) * $7::integer
            ELSE
              GREATEST(
                LEAST(
                  GREATEST(
                    (now() AT TIME ZONE 'Asia/Phnom_Penh')::date - $1::date,
                    0
                  ),
                  $6::integer
                ) - $5::integer,
                0
              ) * $8::integer
          END
          )::numeric(12,2)::text AS "lateFee",
          (
            $2::numeric(12,2) + $3::numeric(12,2) +
            CASE
              WHEN GREATEST(
                (now() AT TIME ZONE 'Asia/Phnom_Penh')::date - $1::date,
                0
              ) <= $5::integer THEN 0
              WHEN $4::text = '${VehicleClass.LIGHT}' THEN
                GREATEST(
                  LEAST(
                    GREATEST(
                      (now() AT TIME ZONE 'Asia/Phnom_Penh')::date - $1::date,
                      0
                    ),
                    $6::integer
                  ) - $5::integer,
                  0
                ) * $7::integer
              ELSE
                GREATEST(
                  LEAST(
                    GREATEST(
                      (now() AT TIME ZONE 'Asia/Phnom_Penh')::date - $1::date,
                      0
                    ),
                    $6::integer
                  ) - $5::integer,
                  0
                ) * $8::integer
            END
          )::numeric(12,2)::text AS "totalAmount"
      `,
      [
        inspectionExpiryDate,
        inspectionFeeKhr,
        serviceFeeKhr,
        vehicleClass,
        latePenalty.startsAfterDays,
        maximumLateDays,
        latePenalty.lightRateKhrPerDay,
        latePenalty.heavyRateKhrPerDay,
      ],
    );

    if (snapshot === undefined) {
      throw new Error('Payment calculation did not return a snapshot');
    }

    return snapshot;
  }

  private applicationReference(application: RenewalApplication): string {
    if (
      application.referenceNumber === null ||
      application.referenceNumber === ''
    ) {
      throw this.invalidPaymentSource(
        'Application reference number is required for payment initialization',
      );
    }

    return application.referenceNumber;
  }

  private generateInvoiceNumber(paymentDate: string): string {
    return generateInvoiceNumber(paymentDate);
  }

  private async deleteInvoiceAfterFailedInitialization(
    invoiceFileKey: string,
  ): Promise<void> {
    try {
      await this.files.deleteIfExists(invoiceFileKey);
    } catch (cleanupError) {
      this.logger.error(
        `Could not delete payment invoice artifact after initialization failure: ${invoiceFileKey}`,
        cleanupError instanceof Error
          ? cleanupError.stack
          : String(cleanupError),
      );
    }
  }

  private async existingPaymentAfterUniqueConflict(
    error: unknown,
    applicationId: string,
  ): Promise<Payment | null> {
    if (!isUniqueConstraintError(error)) {
      return null;
    }

    try {
      return await this.payments.findOne({ where: { applicationId } });
    } catch (lookupError) {
      this.logger.error(
        `Could not load payment after initialization uniqueness conflict: ${applicationId}`,
        lookupError instanceof Error ? lookupError.stack : String(lookupError),
      );
      return null;
    }
  }

  private invalidPaymentSource(message: string): DomainException {
    return new DomainException(
      ApiErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      message,
    );
  }

  private sortColumn(sortBy: AdminPaymentSortField): string {
    switch (sortBy) {
      case 'invoiceIssuedAt':
        return 'payment.invoiceIssuedAt';
      case 'totalAmount':
        return 'payment.totalAmount';
      case 'status':
        return 'payment.status';
      case 'createdAt':
      default:
        return 'payment.createdAt';
    }
  }

  private applicationNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.APPLICATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Renewal application not found',
    );
  }

  private paymentNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.PAYMENT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Payment not found',
    );
  }

  private notOwned(): DomainException {
    return new DomainException(
      ApiErrorCode.RESOURCE_NOT_OWNED,
      HttpStatus.FORBIDDEN,
      'Renewal application is outside the citizen ownership scope',
    );
  }
}

export function generateInvoiceNumber(
  paymentDate: string,
  nextNumericSuffix: () => number = () => randomInt(1_000_000),
): string {
  return `INV-${paymentDate.replaceAll('-', '')}-${nextNumericSuffix()
    .toString()
    .padStart(6, '0')}`;
}

export function generateReceiptNumber(
  confirmationDate: string,
  nextNumericSuffix: () => number = () => randomInt(1_000_000),
): string {
  return `RCP-${confirmationDate.replaceAll('-', '')}-${nextNumericSuffix()
    .toString()
    .padStart(6, '0')}`;
}

interface PaymentCalculationSnapshot {
  invoiceIssuedAt: Date;
  paymentDate: string;
  lateDays: number;
  inspectionFeeKhr: string;
  serviceFeeKhr: string;
  baseAmount: string;
  lateFee: string;
  totalAmount: string;
}

interface ConfirmationTimestamp {
  confirmedAt: Date;
  confirmationDate: string;
}

interface AdminPaymentListResult {
  data: AdminPaymentResponse[];
  meta: ReturnType<typeof createPaginationMeta>;
}

function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isNonnegativeDecimal(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const databaseError = error as {
    code?: unknown;
    driverError?: { code?: unknown };
  };
  const source = databaseError.driverError ?? databaseError;

  return source.code === '23505';
}
