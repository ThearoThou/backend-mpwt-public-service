import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from '../scheduling/entities/inspection-station.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { Inspection } from './entities/inspection.entity';
import { InspectionCommandsService } from './inspection-commands.service';
import { InspectionResult } from './enums/inspection-result.enum';
import { InspectionStatus } from './enums/inspection-status.enum';

describe('InspectionCommandsService', () => {
  it.each([
    [InspectionResult.PASS, [], 1, ApplicationStatus.APPROVED],
    [InspectionResult.FAIL, [], 1, ApplicationStatus.APPROVED],
    [InspectionResult.PASS, [completedFail()], 2, ApplicationStatus.APPROVED],
    [
      InspectionResult.FAIL,
      [completedFail()],
      2,
      ApplicationStatus.INSPECTION_FAILED,
    ],
  ] as const)(
    'records %s with %i completed prior inspection(s)',
    async (result, prior, attemptNumber, expectedApplicationStatus) => {
      const fixture = commandFixture({ prior });
      const service = new InspectionCommandsService(
        fixture.dataSource as never,
      );

      await service.recordResult('appointment-id', 'admin-id', {
        result,
        failureReason:
          result === InspectionResult.FAIL ? '  Brake issue  ' : null,
      });

      expect(fixture.inspections.create).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptNumber,
          status: InspectionStatus.COMPLETED,
          result,
          recordedByUserId: 'admin-id',
          completedAt: fixture.recordedAt,
          failureReason:
            result === InspectionResult.FAIL ? 'Brake issue' : null,
          startedAt: null,
        }),
      );
      expect(fixture.appointment.status).toBe(AppointmentStatus.COMPLETED);
      expect(fixture.appointment.completedAt).toBe(fixture.recordedAt);
      expect(fixture.application.status).toBe(expectedApplicationStatus);
      if (expectedApplicationStatus === ApplicationStatus.INSPECTION_FAILED) {
        expect(fixture.histories.create).toHaveBeenCalledWith(
          expect.objectContaining({
            previousStatus: ApplicationStatus.APPROVED,
            newStatus: ApplicationStatus.INSPECTION_FAILED,
            changedByUserId: 'admin-id',
            reason: 'SECOND_INSPECTION_FAILED',
          }),
        );
      } else {
        expect(fixture.histories.save).not.toHaveBeenCalled();
      }
      expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(fixture.applications.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(fixture.appointments.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(fixture.payments.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    },
  );

  it.each([
    [
      'application is not approved',
      { applicationStatus: ApplicationStatus.REJECTED },
    ],
    ['payment is missing', { payment: null }],
    ['payment is unconfirmed', { paymentStatus: PaymentStatus.PENDING }],
    ['appointment is future', { capacityDate: '2026-08-15' }],
    ['appointment is past', { capacityDate: '2026-08-13' }],
    [
      'appointment is not scheduled',
      { appointmentStatus: AppointmentStatus.CANCELLED },
    ],
    ['inspection already exists', { existingInspection: {} }],
    ['prior PASS exists', { prior: [completedPass()] }],
    ['two attempts exist', { prior: [completedFail(), completedFail()] }],
    ['legacy slot appointment', { dailyCapacityId: null }],
  ])('rejects when %s', async (_name, overrides) => {
    const fixture = commandFixture(overrides);
    const service = new InspectionCommandsService(fixture.dataSource as never);

    await expect(
      service.recordResult('appointment-id', 'admin-id', {
        result: InspectionResult.PASS,
      }),
    ).rejects.toMatchObject({
      status: overrides.payment === null ? 404 : 409,
    });
    expect(fixture.inspections.save).not.toHaveBeenCalled();
  });

  it('marks a past appointment as the first manual NO_SHOW without inspection, payment, or capacity changes', async () => {
    const fixture = commandFixture({
      capacityDate: '2026-08-13',
      noShowCount: 1,
    });
    const service = new InspectionCommandsService(fixture.dataSource as never);

    await service.markNoShowByAdmin('appointment-id', 'admin-id');

    expect(fixture.appointment).toMatchObject({
      status: AppointmentStatus.NO_SHOW,
      noShowMarkedAt: fixture.recordedAt,
      noShowMarkedByUserId: 'admin-id',
    });
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
    expect(fixture.histories.save).not.toHaveBeenCalled();
    expect(fixture.inspections.save).not.toHaveBeenCalled();
    expect(fixture.payments.save).not.toHaveBeenCalled();
    expect(fixture.applications.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(fixture.appointments.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('does not consume an inspection attempt when a replacement after one FAIL is NO_SHOW', async () => {
    const fixture = commandFixture({
      capacityDate: '2026-08-13',
      noShowCount: 1,
      prior: [completedFail()],
    });
    const service = new InspectionCommandsService(fixture.dataSource as never);

    await service.markNoShowByAdmin('appointment-id', 'admin-id');

    expect(fixture.appointment.status).toBe(AppointmentStatus.NO_SHOW);
    expect(fixture.inspections.save).not.toHaveBeenCalled();
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
  });

  it('cancels on the second NO_SHOW and supports a nullable SYSTEM actor', async () => {
    const manual = commandFixture({
      capacityDate: '2026-08-13',
      noShowCount: 2,
    });
    const manualService = new InspectionCommandsService(
      manual.dataSource as never,
    );

    await manualService.markNoShowByAdmin('appointment-id', 'admin-id');

    expect(manual.application).toMatchObject({
      status: ApplicationStatus.CANCELLED,
      cancelledAt: manual.recordedAt,
      cancelledByUserId: 'admin-id',
      cancellationReason: 'NO_SHOW_LIMIT_REACHED',
    });
    expect(manual.histories.create).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: ApplicationStatus.APPROVED,
        newStatus: ApplicationStatus.CANCELLED,
        changedByUserId: 'admin-id',
        reason: 'NO_SHOW_LIMIT_REACHED',
      }),
    );

    const system = commandFixture({
      capacityDate: '2026-08-13',
      noShowCount: 2,
    });
    await new InspectionCommandsService(
      system.dataSource as never,
    ).markNoShowBySystem('appointment-id');
    expect(system.appointment.noShowMarkedByUserId).toBeNull();
    expect(system.application.cancelledByUserId).toBeNull();
    expect(system.histories.create).toHaveBeenCalledWith(
      expect.objectContaining({ changedByUserId: null }),
    );
  });

  it.each([
    ['today', { capacityDate: '2026-08-14' }],
    ['future', { capacityDate: '2026-08-15' }],
    ['non-scheduled', { appointmentStatus: AppointmentStatus.NO_SHOW }],
    ['legacy slot', { dailyCapacityId: null }],
    ['existing inspection', { existingInspection: {} }],
    ['prior PASS', { priorPass: completedPass() }],
    ['corrupt third no-show', { noShowCount: 3 }],
  ])('rejects NO_SHOW for %s', async (_name, overrides) => {
    const fixture = commandFixture({
      capacityDate: '2026-08-13',
      ...overrides,
    });
    const service = new InspectionCommandsService(fixture.dataSource as never);

    await expect(
      service.markNoShowByAdmin('appointment-id', 'admin-id'),
    ).rejects.toMatchObject({ status: 409 });
    expect(fixture.inspections.save).not.toHaveBeenCalled();
  });

  it.each([
    ['Day 1', '2026-08-14', '2026-08-14'],
    ['Day 30', '2026-07-16', '2026-08-14'],
  ])(
    'records the first physical inspection attempt for the renewal application on %s without an appointment',
    async (_name, submittedAtDate, today) => {
      const fixture = commandFixture({ submittedAtDate, today });
      const service = new InspectionCommandsService(
        fixture.dataSource as never,
      );

      await service.recordApplicationFirstResult('application-id', 'admin-id', {
        actualStationId: 'station-id',
        result: InspectionResult.PASS,
      });

      expect(fixture.inspections.create).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: 'application-id',
          appointmentId: null,
          actualStationId: 'station-id',
          attemptNumber: 1,
          result: InspectionResult.PASS,
          completedAt: fixture.recordedAt,
          failureReason: null,
        }),
      );
      expect(fixture.appointments.save).not.toHaveBeenCalled();
      expect(fixture.capacities.save).not.toHaveBeenCalled();
      expect(fixture.payments.save).not.toHaveBeenCalled();
      expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
      expect(fixture.applications.save).not.toHaveBeenCalled();
      expect(fixture.histories.save).not.toHaveBeenCalled();
    },
  );

  it('records a trimmed FAIL as attempt #1 at an active actual station regardless of planning preferences', async () => {
    const fixture = commandFixture({
      preferredInspectionStationId: null,
      preferredInspectionDate: '2026-08-01',
    });
    const service = new InspectionCommandsService(fixture.dataSource as never);

    await service.recordApplicationFirstResult('application-id', 'admin-id', {
      actualStationId: 'station-id',
      result: InspectionResult.FAIL,
      failureReason: '  Brake issue  ',
    });

    expect(fixture.inspections.create).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: null,
        actualStationId: 'station-id',
        attemptNumber: 1,
        result: InspectionResult.FAIL,
        failureReason: 'Brake issue',
      }),
    );
    expect(fixture.application.preferredInspectionStationId).toBeNull();
    expect(fixture.application.preferredInspectionDate).toBe('2026-08-01');
    expect(fixture.application.status).toBe(
      ApplicationStatus.INSPECTION_FAILED,
    );
    expect(fixture.applications.save).toHaveBeenCalledWith(fixture.application);
    expect(fixture.histories.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'application-id',
        previousStatus: ApplicationStatus.APPROVED,
        newStatus: ApplicationStatus.INSPECTION_FAILED,
        changedByUserId: 'admin-id',
        reason: 'INITIAL_INSPECTION_FAILED',
      }),
    );
    expect(fixture.histories.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'application is not approved',
      { applicationStatus: ApplicationStatus.REJECTED },
      409,
    ],
    ['submittedAt is missing', { submittedAt: null }, 409],
    ['payment is missing', { payment: null }, 404],
    ['payment is pending', { paymentStatus: PaymentStatus.PENDING }, 409],
    ['station is unknown or inactive', { station: null }, 404],
    [
      'Day 31 is outside the initial period',
      { submittedAtDate: '2026-07-15' },
      409,
    ],
    ['a completed attempt already exists', { prior: [completedFail()] }, 409],
  ])(
    'rejects application attempt #1 when %s',
    async (_name, changes, status) => {
      const fixture = commandFixture(changes);
      const service = new InspectionCommandsService(
        fixture.dataSource as never,
      );

      await expect(
        service.recordApplicationFirstResult('application-id', 'admin-id', {
          actualStationId: 'station-id',
          result: InspectionResult.PASS,
        }),
      ).rejects.toMatchObject({ status });
      expect(fixture.inspections.save).not.toHaveBeenCalled();
    },
  );
});

function commandFixture(overrides: Record<string, unknown> = {}) {
  const recordedAt = new Date('2026-08-14T03:00:00.000Z');
  const application = {
    id: 'application-id',
    status: ApplicationStatus.APPROVED,
    submittedAt: new Date('2026-08-14T03:00:00.000Z'),
    preferredInspectionStationId: 'preferred-station-id',
    preferredInspectionDate: '2026-08-14',
  };
  const appointment = {
    id: 'appointment-id',
    applicationId: application.id,
    dailyCapacityId: 'capacity-id',
    status: AppointmentStatus.SCHEDULED,
    completedAt: null,
    noShowMarkedAt: null,
    noShowMarkedByUserId: null,
  };
  const capacity = { id: 'capacity-id', capacityDate: '2026-08-14' };
  const payment = {
    applicationId: application.id,
    status: PaymentStatus.CONFIRMED,
  };
  const station = { id: 'station-id', isActive: true };
  const applications = repository(application);
  const appointments = repository(appointment);
  const capacities = repository(capacity);
  const payments = repository(payment);
  const stations = repository(
    Object.prototype.hasOwnProperty.call(overrides, 'station')
      ? overrides.station
      : station,
  );
  const inspections = repository(overrides.existingInspection ?? null);
  inspections.findOne.mockImplementation(({ where }: { where: object }) =>
    'appointmentId' in where
      ? Promise.resolve(overrides.existingInspection ?? null)
      : Promise.resolve(overrides.priorPass ?? null),
  );
  inspections.createQueryBuilder = jest.fn(() =>
    queryBuilder(overrides.prior ?? []),
  );
  const histories = repository(null);
  const repositories = new Map<unknown, ReturnType<typeof repository>>([
    [RenewalApplication, applications],
    [Appointment, appointments],
    [InspectionStationDailyCapacity, capacities],
    [Payment, payments],
    [InspectionStation, stations],
    [Inspection, inspections],
    [RenewalApplicationStatusHistory, histories],
  ]);
  const manager = {
    getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
    query: jest.fn().mockResolvedValue([
      {
        recordedAt,
        today: (overrides.today as string | undefined) ?? '2026-08-14',
        submittedAtDate:
          (overrides.submittedAtDate as string | undefined) ?? '2026-08-14',
      },
    ]),
  };
  const dataSource = {
    getRepository: jest.fn(() => ({
      findOne: jest.fn().mockResolvedValue(appointment),
    })),
    transaction: jest.fn((callback: (value: unknown) => unknown) =>
      callback(manager),
    ),
  };

  if (overrides.applicationStatus !== undefined)
    application.status = overrides.applicationStatus as ApplicationStatus;
  if (overrides.dailyCapacityId !== undefined)
    appointment.dailyCapacityId = overrides.dailyCapacityId as string | null;
  if (overrides.appointmentStatus !== undefined)
    appointment.status = overrides.appointmentStatus as AppointmentStatus;
  if (overrides.capacityDate !== undefined)
    capacity.capacityDate = overrides.capacityDate as string;
  if (overrides.payment === null) payments.findOne.mockResolvedValue(null);
  if (overrides.paymentStatus !== undefined)
    payment.status = overrides.paymentStatus as PaymentStatus;
  if (overrides.submittedAt !== undefined)
    application.submittedAt = overrides.submittedAt as Date | null;
  if (overrides.preferredInspectionStationId !== undefined)
    application.preferredInspectionStationId =
      overrides.preferredInspectionStationId as string | null;
  if (overrides.preferredInspectionDate !== undefined)
    application.preferredInspectionDate = overrides.preferredInspectionDate as
      string | null;
  appointments.count = jest.fn().mockResolvedValue(overrides.noShowCount ?? 1);

  return {
    dataSource,
    recordedAt,
    application,
    appointment,
    applications,
    appointments,
    payments,
    capacities,
    inspections,
    histories,
  };
}

function repository(value: unknown) {
  return {
    findOne: jest.fn().mockResolvedValue(value),
    save: jest.fn().mockResolvedValue(value),
    create: jest.fn((input: unknown) => input),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  };
}

function queryBuilder(rows: unknown[]) {
  return {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
}

function completedFail() {
  return { status: InspectionStatus.COMPLETED, result: InspectionResult.FAIL };
}

function completedPass() {
  return { status: InspectionStatus.COMPLETED, result: InspectionResult.PASS };
}
