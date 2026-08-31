import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { calendarDayDifference } from '../common/dates/calendar-date';
import { inspectionPolicy } from '../config/inspection-policy';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from '../scheduling/entities/inspection-station.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { RecordInspectionResultDto } from './dto/record-inspection-result.dto';
import { RecordApplicationInspectionResultDto } from './dto/record-application-inspection-result.dto';
import { Inspection } from './entities/inspection.entity';
import { InspectionResult } from './enums/inspection-result.enum';
import { InspectionStatus } from './enums/inspection-status.enum';

@Injectable()
export class InspectionCommandsService {
  constructor(private readonly dataSource: DataSource) {}

  async recordResult(
    appointmentId: string,
    adminId: string,
    input: RecordInspectionResultDto,
  ): Promise<void> {
    const normalizedInput = this.normalizeInput(input);
    const applicationId =
      await this.findAppointmentApplicationId(appointmentId);
    try {
      await this.dataSource.transaction((manager) =>
        this.recordResultWithManager(
          manager,
          applicationId,
          appointmentId,
          adminId,
          normalizedInput,
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw this.inspectionConflict();
      throw error;
    }
  }

  /**
   * Records attempt #1: the first physical inspection attempt for this renewal
   * application. It is intentionally independent of the legacy appointment
   * and capacity workflow retained for historical/reinspection compatibility.
   */
  async recordApplicationFirstResult(
    applicationId: string,
    adminId: string,
    input: RecordApplicationInspectionResultDto,
  ): Promise<void> {
    const normalizedInput = this.normalizeInput(input);
    try {
      await this.dataSource.transaction((manager) =>
        this.recordApplicationFirstResultWithManager(
          manager,
          applicationId,
          adminId,
          input.actualStationId,
          normalizedInput,
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw this.inspectionConflict();
      throw error;
    }
  }

  async markNoShowByAdmin(
    appointmentId: string,
    adminId: string,
  ): Promise<void> {
    await this.markNoShow(appointmentId, adminId);
  }

  async markNoShowBySystem(appointmentId: string): Promise<void> {
    await this.markNoShow(appointmentId, null);
  }

  private async markNoShow(
    appointmentId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const applicationId =
      await this.findAppointmentApplicationId(appointmentId);
    await this.dataSource.transaction((manager) =>
      this.markNoShowWithManager(
        manager,
        applicationId,
        appointmentId,
        actorUserId,
      ),
    );
  }

  private async recordResultWithManager(
    manager: EntityManager,
    applicationId: string,
    appointmentId: string,
    adminId: string,
    input: RecordInspectionResultDto,
  ): Promise<void> {
    const application = await manager
      .getRepository(RenewalApplication)
      .findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
    if (application === null) throw this.applicationNotFound();

    const appointment = await manager.getRepository(Appointment).findOne({
      where: { id: appointmentId, applicationId: application.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (appointment === null) throw this.appointmentNotFound();
    if (appointment.dailyCapacityId === null) throw this.appointmentConflict();

    const capacity = await manager
      .getRepository(InspectionStationDailyCapacity)
      .findOne({
        where: { id: appointment.dailyCapacityId },
        lock: { mode: 'pessimistic_write' },
      });
    if (capacity === null) throw this.appointmentConflict();

    const payment = await manager.getRepository(Payment).findOne({
      where: { applicationId: application.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (payment === null) throw this.paymentNotFound();

    const timestamp = await this.currentTimestamp(manager);
    this.assertEligibility(
      application,
      appointment,
      payment,
      capacity,
      timestamp,
    );

    const existing = await manager.getRepository(Inspection).findOne({
      where: { appointmentId: appointment.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing !== null) throw this.inspectionAlreadyExists();

    const completed = await manager
      .getRepository(Inspection)
      .createQueryBuilder('inspection')
      .setLock('pessimistic_write')
      .where('inspection.applicationId = :applicationId', {
        applicationId: application.id,
      })
      .andWhere('inspection.status = :status', {
        status: InspectionStatus.COMPLETED,
      })
      .getMany();
    const attemptNumber = this.deriveAttempt(completed);
    const recordedAt = timestamp.recordedAt;
    const inspection = manager.getRepository(Inspection).create({
      applicationId: application.id,
      appointmentId: appointment.id,
      attemptNumber,
      status: InspectionStatus.COMPLETED,
      result: input.result,
      recordedByUserId: adminId,
      startedAt: null,
      completedAt: recordedAt,
      failureReason:
        input.result === InspectionResult.FAIL
          ? (input.failureReason ?? null)
          : null,
      notes: null,
    });
    await manager.getRepository(Inspection).save(inspection);

    appointment.status = AppointmentStatus.COMPLETED;
    appointment.completedAt = recordedAt;
    await manager.getRepository(Appointment).save(appointment);

    if (attemptNumber === 2 && input.result === InspectionResult.FAIL) {
      application.status = ApplicationStatus.INSPECTION_FAILED;
      await manager.getRepository(RenewalApplication).save(application);
      const history = manager.getRepository(RenewalApplicationStatusHistory);
      await history.save(
        history.create({
          applicationId: application.id,
          previousStatus: ApplicationStatus.APPROVED,
          newStatus: ApplicationStatus.INSPECTION_FAILED,
          changedByUserId: adminId,
          reason: 'SECOND_INSPECTION_FAILED',
        }),
      );
    }
  }

  private async recordApplicationFirstResultWithManager(
    manager: EntityManager,
    applicationId: string,
    adminId: string,
    actualStationId: string,
    input: RecordInspectionResultDto,
  ): Promise<void> {
    const applications = manager.getRepository(RenewalApplication);
    const application = await applications.findOne({
      where: { id: applicationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (application === null) throw this.applicationNotFound();
    if (application.status !== ApplicationStatus.APPROVED) {
      throw this.applicationConflict();
    }
    if (application.submittedAt === null) throw this.applicationConflict();

    const timestamp = await this.currentTimestamp(
      manager,
      application.submittedAt,
    );
    this.assertInitialApplicationPeriod(timestamp);

    const payment = await manager.getRepository(Payment).findOne({
      where: { applicationId: application.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (payment === null) throw this.paymentNotFound();
    this.assertPaymentConfirmed(payment);

    const station = await manager.getRepository(InspectionStation).findOne({
      where: { id: actualStationId, isActive: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (station === null) throw this.stationNotFound();

    const inspections = manager.getRepository(Inspection);
    const completed = await inspections
      .createQueryBuilder('inspection')
      .setLock('pessimistic_write')
      .where('inspection.applicationId = :applicationId', {
        applicationId: application.id,
      })
      .andWhere('inspection.status = :status', {
        status: InspectionStatus.COMPLETED,
      })
      .getMany();
    // Any completed row means attempt #1 already exists or legacy data is
    // inconsistent. Attempt #2 is deliberately outside Phase 2.
    if (completed.length !== 0) throw this.inspectionConflict();

    const inspection = inspections.create({
      applicationId: application.id,
      appointmentId: null,
      actualStationId: station.id,
      attemptNumber: 1,
      status: InspectionStatus.COMPLETED,
      result: input.result,
      recordedByUserId: adminId,
      startedAt: null,
      completedAt: timestamp.recordedAt,
      failureReason:
        input.result === InspectionResult.FAIL
          ? (input.failureReason ?? null)
          : null,
      notes: null,
    });
    await inspections.save(inspection);

    if (input.result === InspectionResult.FAIL) {
      application.status = ApplicationStatus.INSPECTION_FAILED;
      await applications.save(application);
      const history = manager.getRepository(RenewalApplicationStatusHistory);
      await history.save(
        history.create({
          applicationId: application.id,
          previousStatus: ApplicationStatus.APPROVED,
          newStatus: ApplicationStatus.INSPECTION_FAILED,
          changedByUserId: adminId,
          reason: 'INITIAL_INSPECTION_FAILED',
        }),
      );
    }
  }

  private async markNoShowWithManager(
    manager: EntityManager,
    applicationId: string,
    appointmentId: string,
    actorUserId: string | null,
  ): Promise<void> {
    const application = await manager
      .getRepository(RenewalApplication)
      .findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
    if (application === null) throw this.applicationNotFound();
    if (application.status !== ApplicationStatus.APPROVED) {
      throw this.applicationConflict();
    }

    const appointment = await manager.getRepository(Appointment).findOne({
      where: { id: appointmentId, applicationId: application.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (appointment === null) throw this.appointmentNotFound();
    if (appointment.dailyCapacityId === null) throw this.appointmentConflict();

    const capacity = await manager
      .getRepository(InspectionStationDailyCapacity)
      .findOne({
        where: { id: appointment.dailyCapacityId },
        lock: { mode: 'pessimistic_write' },
      });
    if (capacity === null) throw this.appointmentConflict();
    const timestamp = await this.currentTimestamp(manager);
    if (capacity.capacityDate >= timestamp.today)
      throw this.appointmentConflict();
    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      throw this.appointmentConflict();
    }

    const inspections = manager.getRepository(Inspection);
    const currentInspection = await inspections.findOne({
      where: { appointmentId: appointment.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (currentInspection !== null) throw this.inspectionAlreadyExists();
    const priorPass = await inspections.findOne({
      where: {
        applicationId: application.id,
        status: InspectionStatus.COMPLETED,
        result: InspectionResult.PASS,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (priorPass !== null) throw this.inspectionConflict();

    appointment.status = AppointmentStatus.NO_SHOW;
    appointment.noShowMarkedAt = timestamp.recordedAt;
    appointment.noShowMarkedByUserId = actorUserId;
    await manager.getRepository(Appointment).save(appointment);

    const noShowCount = await manager.getRepository(Appointment).count({
      where: {
        applicationId: application.id,
        status: AppointmentStatus.NO_SHOW,
      },
    });
    if (noShowCount > 2) throw this.inspectionConflict();
    if (noShowCount === 2) {
      application.status = ApplicationStatus.CANCELLED;
      application.cancelledAt = timestamp.recordedAt;
      application.cancelledByUserId = actorUserId;
      application.cancellationReason = 'NO_SHOW_LIMIT_REACHED';
      await manager.getRepository(RenewalApplication).save(application);
      const history = manager.getRepository(RenewalApplicationStatusHistory);
      await history.save(
        history.create({
          applicationId: application.id,
          previousStatus: ApplicationStatus.APPROVED,
          newStatus: ApplicationStatus.CANCELLED,
          changedByUserId: actorUserId,
          reason: 'NO_SHOW_LIMIT_REACHED',
        }),
      );
    }
  }

  private async findAppointmentApplicationId(
    appointmentId: string,
  ): Promise<string> {
    const appointment = await this.dataSource
      .getRepository(Appointment)
      .findOne({
        where: { id: appointmentId },
        select: { applicationId: true },
      });
    if (appointment === null) throw this.appointmentNotFound();
    return appointment.applicationId;
  }

  private normalizeInput(
    input: RecordInspectionResultDto,
  ): RecordInspectionResultDto {
    if (input.result === InspectionResult.PASS) {
      if (input.failureReason !== undefined && input.failureReason !== null) {
        throw this.invalidFailureReason();
      }
      return { result: input.result, failureReason: null };
    }
    const failureReason =
      typeof input.failureReason === 'string'
        ? input.failureReason.trim()
        : input.failureReason;
    if (
      input.result !== InspectionResult.FAIL ||
      typeof failureReason !== 'string' ||
      failureReason === '' ||
      failureReason.length > 500
    ) {
      throw this.invalidFailureReason();
    }
    return { result: input.result, failureReason };
  }

  private async currentTimestamp(
    manager: EntityManager,
    submittedAt?: Date,
  ): Promise<Timestamp> {
    const [timestamp] = await manager.query<Timestamp[]>(
      `SELECT now() AS "recordedAt", (now() AT TIME ZONE 'Asia/Phnom_Penh')::date::text AS "today", ($1::timestamptz AT TIME ZONE 'Asia/Phnom_Penh')::date::text AS "submittedAtDate"`,
      [submittedAt ?? null],
    );
    if (timestamp === undefined)
      throw new Error('Inspection timestamp unavailable');
    return timestamp;
  }

  private assertInitialApplicationPeriod(timestamp: Timestamp): void {
    if (timestamp.submittedAtDate === null) throw this.applicationConflict();
    const elapsedDays = calendarDayDifference(
      timestamp.submittedAtDate,
      timestamp.today,
    );
    if (
      elapsedDays < 0 ||
      elapsedDays >= inspectionPolicy.application.initialInspectionPeriodDays
    ) {
      throw this.applicationConflict();
    }
  }

  private assertPaymentConfirmed(payment: Payment): void {
    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw new DomainException(
        ApiErrorCode.PAYMENT_NOT_CONFIRMED,
        HttpStatus.CONFLICT,
        'Payment must be confirmed before recording an inspection result',
      );
    }
  }

  private assertEligibility(
    application: RenewalApplication,
    appointment: Appointment,
    payment: Payment,
    capacity: InspectionStationDailyCapacity,
    timestamp: Timestamp,
  ): void {
    if (application.status !== ApplicationStatus.APPROVED) {
      throw this.applicationConflict();
    }
    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw new DomainException(
        ApiErrorCode.PAYMENT_NOT_CONFIRMED,
        HttpStatus.CONFLICT,
        'Payment must be confirmed before recording an inspection result',
      );
    }
    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      throw this.appointmentConflict();
    }
    if (capacity.capacityDate !== timestamp.today)
      throw this.appointmentConflict();
  }

  private deriveAttempt(completed: Inspection[]): number {
    if (completed.length === 0) return 1;
    if (completed.length >= 2) throw this.inspectionConflict();
    if (completed[0]?.result === InspectionResult.FAIL) return 2;
    throw this.inspectionConflict();
  }

  private applicationNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.APPLICATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Renewal application not found',
    );
  }
  private applicationConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.APPLICATION_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'Application is not eligible for inspection result recording',
    );
  }
  private appointmentNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.APPOINTMENT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Appointment not found',
    );
  }
  private appointmentConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.APPOINTMENT_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'Appointment is not eligible for inspection result recording',
    );
  }
  private paymentNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.PAYMENT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Payment not found',
    );
  }
  private stationNotFound(): DomainException {
    return new DomainException(
      ApiErrorCode.STATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Active inspection station not found',
    );
  }
  private inspectionAlreadyExists(): DomainException {
    return new DomainException(
      ApiErrorCode.INSPECTION_ALREADY_EXISTS,
      HttpStatus.CONFLICT,
      'An inspection result has already been recorded for this appointment',
    );
  }
  private invalidFailureReason(): DomainException {
    return new DomainException(
      ApiErrorCode.INSPECTION_FAILURE_REASON_REQUIRED,
      HttpStatus.BAD_REQUEST,
      'A FAIL result requires a non-empty failure reason of at most 500 characters',
    );
  }
  private inspectionConflict(): DomainException {
    return new DomainException(
      ApiErrorCode.INSPECTION_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'Inspection attempt state is invalid',
    );
  }
}

interface Timestamp {
  recordedAt: Date;
  today: string;
  submittedAtDate: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: unknown;
    driverError?: { code?: unknown };
  };
  return (candidate.driverError ?? candidate).code === '23505';
}
