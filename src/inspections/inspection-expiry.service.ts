import { Injectable } from '@nestjs/common';
import { DataSource, In, type EntityManager } from 'typeorm';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { DomainException } from '../common/errors/domain.exception';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { InspectionCommandsService } from './inspection-commands.service';
import { Inspection } from './entities/inspection.entity';
import { InspectionResult } from './enums/inspection-result.enum';
import { InspectionStatus } from './enums/inspection-status.enum';

const BATCH_SIZE = 100;
type ProcessResult = { scanned: number; processed: number; skipped: number };

@Injectable()
export class InspectionExpiryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly commands: InspectionCommandsService,
  ) {}

  async processDueActions(): Promise<{
    noShows: ProcessResult;
    noShowRebookingExpiries: ProcessResult;
    reinspectionDeadlineExpiries: ProcessResult;
  }> {
    return {
      noShows: await this.processPastScheduledNoShows(),
      noShowRebookingExpiries: await this.processNoShowRebookingExpiries(),
      reinspectionDeadlineExpiries:
        await this.processReinspectionDeadlineExpiries(),
    };
  }

  async processPastScheduledNoShows(): Promise<ProcessResult> {
    const ids = await this.dataSource
      .getRepository(Appointment)
      .createQueryBuilder('appointment')
      .innerJoin(
        RenewalApplication,
        'application',
        'application.id = appointment.applicationId',
      )
      .innerJoin(
        InspectionStationDailyCapacity,
        'capacity',
        'capacity.id = appointment.dailyCapacityId',
      )
      .leftJoin(
        Inspection,
        'inspection',
        'inspection.appointmentId = appointment.id',
      )
      .select('appointment.id', 'id')
      .where('application.status = :approved', {
        approved: ApplicationStatus.APPROVED,
      })
      .andWhere('appointment.status = :scheduled', {
        scheduled: AppointmentStatus.SCHEDULED,
      })
      .andWhere('appointment.dailyCapacityId IS NOT NULL')
      .andWhere('inspection.id IS NULL')
      .andWhere(
        "capacity.capacityDate < (now() AT TIME ZONE 'Asia/Phnom_Penh')::date",
      )
      .orderBy('capacity.capacityDate', 'ASC')
      .addOrderBy('appointment.id', 'ASC')
      .take(BATCH_SIZE)
      .getRawMany<{ id: string }>();
    return this.process(
      ids.map(({ id }) => id),
      async (id) => {
        await this.commands.markNoShowBySystem(id);
        return true;
      },
    );
  }

  async processNoShowRebookingExpiries(): Promise<ProcessResult> {
    const ids = await this.firstNoShowExpiryCandidates();
    return this.process(ids, (id) => this.expireNoShowRebooking(id));
  }

  async processReinspectionDeadlineExpiries(): Promise<ProcessResult> {
    const ids = await this.dataSource
      .getRepository(Inspection)
      .createQueryBuilder('inspection')
      .innerJoin(
        RenewalApplication,
        'application',
        'application.id = inspection.applicationId',
      )
      .select('inspection.applicationId', 'id')
      .where('application.status = :approved', {
        approved: ApplicationStatus.APPROVED,
      })
      .andWhere('inspection.status = :completed', {
        status: InspectionStatus.COMPLETED,
      })
      .andWhere('inspection.attemptNumber = 1')
      .andWhere('inspection.result = :fail', { result: InspectionResult.FAIL })
      .orderBy('inspection.completedAt', 'ASC')
      .addOrderBy('inspection.applicationId', 'ASC')
      .take(BATCH_SIZE)
      .getRawMany<{ id: string }>();
    return this.process(
      ids.map(({ id }) => id),
      (id) => this.expireReinspection(id),
    );
  }

  private async firstNoShowExpiryCandidates(): Promise<string[]> {
    const rows = await this.dataSource
      .getRepository(Appointment)
      .createQueryBuilder('appointment')
      .innerJoin(
        RenewalApplication,
        'application',
        'application.id = appointment.applicationId',
      )
      .innerJoin(
        InspectionStationDailyCapacity,
        'capacity',
        'capacity.id = appointment.dailyCapacityId',
      )
      .select('appointment.applicationId', 'id')
      .addSelect('MIN(capacity.capacityDate)', 'dueDate')
      .where('application.status = :approved', {
        approved: ApplicationStatus.APPROVED,
      })
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.NO_SHOW,
      })
      .andWhere('appointment.dailyCapacityId IS NOT NULL')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM inspections completed_inspection
          WHERE completed_inspection.application_id = appointment.application_id
            AND completed_inspection.status = :completed
        )`,
        { completed: InspectionStatus.COMPLETED },
      )
      .andWhere(
        "capacity.capacity_date + INTERVAL '30 days' < (now() AT TIME ZONE 'Asia/Phnom_Penh')::date",
      )
      .groupBy('appointment.applicationId')
      .orderBy('MIN(capacity.capacityDate)', 'ASC')
      .addOrderBy('appointment.applicationId', 'ASC')
      .take(BATCH_SIZE)
      .getRawMany<{ id: string }>();
    return rows.map(({ id }) => id);
  }

  private async process(
    ids: string[],
    action: (id: string) => Promise<boolean>,
  ): Promise<ProcessResult> {
    let processed = 0;
    let skipped = 0;
    for (const id of ids) {
      try {
        if (await action(id)) processed += 1;
        else skipped += 1;
      } catch (error) {
        if (error instanceof DomainException) skipped += 1;
        else throw error;
      }
    }
    return { scanned: ids.length, processed, skipped };
  }

  private async expireNoShowRebooking(applicationId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, applicationId);
      if (state === null || state.inspections.length !== 0) return false;
      const noShows = state.appointments.filter(
        (appointment) => appointment.status === AppointmentStatus.NO_SHOW,
      );
      if (noShows.length !== 1) return false;
      const missed = noShows[0];
      if (
        missed === undefined ||
        missed.dailyCapacityId === null ||
        missed.noShowMarkedAt === null
      )
        return false;
      const missedDate = state.capacityDates.get(missed.dailyCapacityId);
      if (missedDate === undefined) return false;
      const deadline = plus30(missedDate);
      if (deadline >= state.today) return false;
      const replacement = state.appointments.some(
        (appointment) =>
          appointment.id !== missed.id &&
          appointment.dailyCapacityId !== null &&
          appointment.bookedAt instanceof Date &&
          missed.noShowMarkedAt instanceof Date &&
          appointment.bookedAt > missed.noShowMarkedAt &&
          cambodiaDate(appointment.bookedAt) <= deadline,
      );
      if (replacement) return false;
      await this.transition(
        manager,
        state.application,
        ApplicationStatus.CANCELLED,
        'NO_SHOW_REBOOKING_DEADLINE_EXPIRED',
        state.recordedAt,
      );
      return true;
    });
  }

  private async expireReinspection(applicationId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, applicationId);
      if (state === null) return false;
      const completed = state.inspections;
      if (completed.length !== 1) return false;
      const first = completed[0];
      if (
        first === undefined ||
        first.attemptNumber !== 1 ||
        first.result !== InspectionResult.FAIL ||
        first.completedAt === null
      )
        return false;
      const anchor = state.appointments.find(
        (a) => a.id === first.appointmentId,
      );
      if (
        anchor?.dailyCapacityId === null ||
        anchor === undefined ||
        !state.capacityDates.has(anchor.dailyCapacityId)
      )
        return false;
      if (
        state.appointments.some(
          (appointment) =>
            appointment.status === AppointmentStatus.SCHEDULED &&
            appointment.dailyCapacityId !== null &&
            state.capacityDates.get(appointment.dailyCapacityId)! <
              state.today &&
            !state.inspections.some(
              (inspection) => inspection.appointmentId === appointment.id,
            ),
        )
      )
        return false;
      if (plus30(cambodiaDate(first.completedAt)) >= state.today) return false;
      await this.transition(
        manager,
        state.application,
        ApplicationStatus.INSPECTION_FAILED,
        'REINSPECTION_DEADLINE_EXPIRED',
        state.recordedAt,
      );
      return true;
    });
  }

  private async lockState(
    manager: EntityManager,
    applicationId: string,
  ): Promise<State | null> {
    const application = await manager
      .getRepository(RenewalApplication)
      .findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
    if (
      application === null ||
      application.status !== ApplicationStatus.APPROVED
    )
      return null;
    const appointments = await manager
      .getRepository(Appointment)
      .find({ where: { applicationId } });
    const inspections = await manager.getRepository(Inspection).find({
      where: { applicationId, status: InspectionStatus.COMPLETED },
      order: { attemptNumber: 'ASC' },
    });
    const capacityIds = appointments.flatMap((a) =>
      a.dailyCapacityId === null ? [] : [a.dailyCapacityId],
    );
    const capacities = await manager
      .getRepository(InspectionStationDailyCapacity)
      .find({ where: { id: In(capacityIds) } });
    const [clock] = await manager.query<{ today: string; recordedAt: Date }[]>(
      'SELECT now() AS "recordedAt", (now() AT TIME ZONE \'Asia/Phnom_Penh\')::date::text AS "today"',
    );
    if (clock === undefined)
      throw new Error('Inspection expiry clock unavailable');
    return {
      application,
      appointments,
      inspections,
      capacityDates: new Map(capacities.map((c) => [c.id, c.capacityDate])),
      today: clock.today,
      recordedAt: clock.recordedAt,
    };
  }

  private async transition(
    manager: EntityManager,
    application: RenewalApplication,
    status: ApplicationStatus,
    reason: string,
    recordedAt: Date,
  ): Promise<void> {
    application.status = status;
    if (status === ApplicationStatus.CANCELLED) {
      application.cancelledAt = recordedAt;
      application.cancelledByUserId = null;
      application.cancellationReason = reason;
    }
    await manager.getRepository(RenewalApplication).save(application);
    const history = manager.getRepository(RenewalApplicationStatusHistory);
    await history.save(
      history.create({
        applicationId: application.id,
        previousStatus: ApplicationStatus.APPROVED,
        newStatus: status,
        changedByUserId: null,
        reason,
      }),
    );
  }
}

interface State {
  application: RenewalApplication;
  appointments: Appointment[];
  inspections: Inspection[];
  capacityDates: Map<string, string>;
  today: string;
  recordedAt: Date;
}
function plus30(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 30);
  return value.toISOString().slice(0, 10);
}
function cambodiaDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
