import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { InspectionStation } from '../scheduling/entities/inspection-station.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStationDailyCapacityService } from '../scheduling/inspection-station-daily-capacity.service';
import { CitizenSchedulingAvailabilityService } from '../scheduling/citizen-scheduling-availability.service';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { BookReplacementInspectionDto } from './dto/replacement-inspection.dto';
import { Inspection } from './entities/inspection.entity';
import { InspectionResult } from './enums/inspection-result.enum';
import { InspectionStatus } from './enums/inspection-status.enum';
import { inspectionPolicy } from '../config/inspection-policy';

type Branch = {
  reason: 'REINSPECTION' | 'NO_SHOW_REPLACEMENT';
  deadline: string;
};
const SCHEDULED_APPOINTMENT_UNIQUE_CONSTRAINT =
  'uq_scheduled_appointment_per_application';

@Injectable()
export class InspectionReplacementSchedulingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly capacities: InspectionStationDailyCapacityService,
    private readonly availability: CitizenSchedulingAvailabilityService,
  ) {}

  async availableDates(
    citizenId: string,
    applicationId: string,
    stationId: string,
  ) {
    const state = await this.loadState(citizenId, applicationId);
    const branch = this.derive(state, state.today);
    const dates = await this.availability.listSelectableDates(stationId);
    return {
      applicationId,
      stationId,
      bookingReason: branch.reason,
      bookingDeadline:
        branch.reason === 'NO_SHOW_REPLACEMENT' ? branch.deadline : null,
      reinspectionDeadline:
        branch.reason === 'REINSPECTION' ? branch.deadline : null,
      availableDates:
        branch.reason === 'REINSPECTION'
          ? dates.filter((date) => date.capacityDate <= branch.deadline)
          : dates,
    };
  }

  async book(
    citizenId: string,
    applicationId: string,
    input: BookReplacementInspectionDto,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const application = await manager
          .getRepository(RenewalApplication)
          .findOne({
            where: { id: applicationId, citizenId },
            lock: { mode: 'pessimistic_write' },
          });
        if (application === null || application.citizenId !== citizenId)
          throw this.notFound();
        const state = await this.loadState(
          citizenId,
          applicationId,
          manager,
          application,
        );
        const branch = this.derive(state, state.today);
        if (
          branch.reason === 'REINSPECTION' &&
          (input.capacityDate <= state.today ||
            input.capacityDate > branch.deadline)
        )
          throw this.conflict();
        const reserved = await this.capacities.reserveDailyCapacityWithManager(
          manager,
          input.stationId,
          input.capacityDate,
        );
        if (reserved === null) throw this.conflict();
        const appointment = await manager.getRepository(Appointment).save(
          manager.getRepository(Appointment).create({
            applicationId,
            dailyCapacityId: reserved.id,
            slotId: null,
            status: AppointmentStatus.SCHEDULED,
            completedAt: null,
            cancelledAt: null,
            cancelledByUserId: null,
            cancellationReason: null,
            noShowMarkedAt: null,
            noShowMarkedByUserId: null,
          }),
        );
        const station = await manager
          .getRepository(InspectionStation)
          .findOne({ where: { id: input.stationId } });
        if (station === null) throw this.conflict();
        return {
          applicationId,
          appointmentId: appointment.id,
          status: appointment.status,
          bookingReason: branch.reason,
          capacityDate: reserved.capacityDate,
          station: {
            id: station.id,
            code: station.code,
            nameKh: station.nameKh,
            nameEn: station.nameEn,
          },
        };
      });
    } catch (error) {
      if (isScheduledAppointmentUniqueViolation(error)) throw this.conflict();
      throw error;
    }
  }

  private async loadState(
    citizenId: string,
    applicationId: string,
    manager?: EntityManager,
    lockedApplication?: RenewalApplication,
  ): Promise<State> {
    const source = manager ?? this.dataSource;
    const application =
      lockedApplication ??
      (await source
        .getRepository(RenewalApplication)
        .findOne({ where: { id: applicationId, citizenId } }));
    if (application === null || application.citizenId !== citizenId)
      throw this.notFound();
    if (application.status !== ApplicationStatus.APPROVED)
      throw this.conflict();
    const payment = await source
      .getRepository(Payment)
      .findOne(
        manager
          ? { where: { applicationId }, lock: { mode: 'pessimistic_write' } }
          : { where: { applicationId } },
      );
    if (payment === null || payment.status !== PaymentStatus.CONFIRMED)
      throw this.conflict();
    const inspections = await source.getRepository(Inspection).find({
      where: { applicationId, status: InspectionStatus.COMPLETED },
      order: { attemptNumber: 'ASC' },
    });
    const appointments = await source
      .getRepository(Appointment)
      .find({ where: { applicationId } });
    const [clock] = await source.query<{ today: string }[]>(
      `SELECT ((now() AT TIME ZONE 'Asia/Phnom_Penh')::date)::text AS "today"`,
    );
    if (clock === undefined)
      throw new Error('Replacement booking clock unavailable');
    const capacityIds = appointments.flatMap((appointment) =>
      appointment.dailyCapacityId === null ? [] : [appointment.dailyCapacityId],
    );
    const capacities = await source
      .getRepository(InspectionStationDailyCapacity)
      .find({ where: { id: In(capacityIds) } });
    const capacityDates = new Map(
      capacities.map((capacity) => [capacity.id, capacity.capacityDate]),
    );
    const dates = new Map(
      appointments.flatMap((appointment) => {
        const capacityDate =
          appointment.dailyCapacityId === null
            ? undefined
            : capacityDates.get(appointment.dailyCapacityId);
        return capacityDate === undefined
          ? []
          : [[appointment.id, capacityDate]];
      }),
    );
    return {
      application,
      inspections,
      appointments,
      dates,
      today: clock.today,
    };
  }

  private derive(state: State, today: string): Branch {
    const scheduled = state.appointments.some(
      (a) => a.status === AppointmentStatus.SCHEDULED,
    );
    const noShows = state.appointments.filter(
      (a) => a.status === AppointmentStatus.NO_SHOW,
    );
    if (noShows.length >= 2) throw this.conflict();
    if (
      scheduled ||
      state.inspections.some((i) => i.result === InspectionResult.PASS) ||
      state.inspections.length >= 2
    )
      throw this.conflict();
    const firstFail =
      state.inspections.length === 1 &&
      state.inspections[0]?.attemptNumber === 1 &&
      state.inspections[0]?.result === InspectionResult.FAIL
        ? state.inspections[0]
        : null;
    if (firstFail !== null) {
      const failAppointment = state.appointments.find(
        (appointment) => appointment.id === firstFail.appointmentId,
      );
      if (
        failAppointment === undefined ||
        failAppointment.dailyCapacityId === null ||
        !state.dates.has(failAppointment.id)
      ) {
        throw this.conflict();
      }
      const deadline = cambodiaDatePlusDays(
        firstFail.completedAt,
        inspectionPolicy.application.reinspectionDeadlineDays,
      );
      if (deadline <= today) throw this.conflict();
      return { reason: 'REINSPECTION', deadline };
    }
    if (state.inspections.length === 0 && noShows.length === 1) {
      const missed = state.dates.get(noShows[0].id);
      if (missed === undefined) throw this.conflict();
      const deadline = addCalendarDays(
        missed,
        inspectionPolicy.application.noShowRebookingDeadlineDays,
      );
      if (deadline < today) throw this.conflict();
      return { reason: 'NO_SHOW_REPLACEMENT', deadline };
    }
    throw this.conflict();
  }
  private notFound() {
    return new DomainException(
      ApiErrorCode.APPLICATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Renewal application not found',
    );
  }
  private conflict() {
    return new DomainException(
      ApiErrorCode.INSPECTION_INVALID_TRANSITION,
      HttpStatus.CONFLICT,
      'Replacement inspection booking is not available',
    );
  }
}
interface State {
  application: RenewalApplication;
  inspections: Inspection[];
  appointments: Appointment[];
  dates: Map<string, string>;
  today: string;
}
function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function cambodiaDatePlusDays(date: Date | null, days: number): string {
  if (date === null) throw new Error('Completed inspection date is required');
  const text = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return addCalendarDays(text, days);
}
function isScheduledAppointmentUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    driverError?: { code?: unknown; constraint?: unknown };
  };
  const databaseError = candidate.driverError ?? candidate;
  return (
    databaseError.code === '23505' &&
    databaseError.constraint === SCHEDULED_APPOINTMENT_UNIQUE_CONSTRAINT
  );
}
