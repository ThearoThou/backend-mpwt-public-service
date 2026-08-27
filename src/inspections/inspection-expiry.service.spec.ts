import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { inspectionPolicy } from '../config/inspection-policy';
import { Inspection } from './entities/inspection.entity';
import { InspectionResult } from './enums/inspection-result.enum';
import { InspectionStatus } from './enums/inspection-status.enum';
import { InspectionExpiryService } from './inspection-expiry.service';

describe('InspectionExpiryService', () => {
  it('selects bounded deterministic overdue daily-capacity appointments and uses the system NO_SHOW command', async () => {
    const fixture = fixtureFor({
      today: '2026-10-01',
      submittedAtDate: '2026-09-01',
    });
    fixture.rawRows.splice(
      0,
      0,
      { id: 'appointment-a' },
      { id: 'appointment-b' },
    );

    await expect(
      fixture.service.processPastScheduledNoShows(),
    ).resolves.toEqual({
      scanned: 2,
      processed: 2,
      skipped: 0,
    });
    expect(fixture.commands.markNoShowBySystem).toHaveBeenNthCalledWith(
      1,
      'appointment-a',
    );
    expect(fixture.commands.markNoShowBySystem).toHaveBeenNthCalledWith(
      2,
      'appointment-b',
    );
    expect(fixture.builder.andWhere).toHaveBeenCalledWith(
      'inspection.id IS NULL',
    );
    expect(fixture.builder.andWhere).toHaveBeenCalledWith(
      "capacity.capacityDate < (now() AT TIME ZONE 'Asia/Phnom_Penh')::date",
    );
    expect(fixture.builder.take).toHaveBeenCalledWith(100);
  });

  it('cancels an expired first NO_SHOW with system history metadata', async () => {
    const fixture = fixtureFor({
      today: '2026-09-01',
      appointments: [
        appointment(
          'missed',
          AppointmentStatus.NO_SHOW,
          'capacity-1',
          '2026-07-01',
        ),
      ],
      capacities: [{ id: 'capacity-1', capacityDate: '2026-08-01' }],
    });

    await invoke(fixture.service, 'expireNoShowRebooking', 'application-id');

    expect(fixture.application.status).toBe(ApplicationStatus.CANCELLED);
    expect(fixture.application.cancelledByUserId).toBeNull();
    expect(fixture.application.cancellationReason).toBe(
      'NO_SHOW_REBOOKING_DEADLINE_EXPIRED',
    );
    expect(fixture.history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: ApplicationStatus.APPROVED,
        newStatus: ApplicationStatus.CANCELLED,
        changedByUserId: null,
        reason: 'NO_SHOW_REBOOKING_DEADLINE_EXPIRED',
      }),
    );
  });

  it('does not expire first NO_SHOW on its booking deadline or if a replacement was booked by it', async () => {
    const onDeadline = fixtureFor({
      today: '2026-08-31',
      appointments: [
        appointment(
          'missed',
          AppointmentStatus.NO_SHOW,
          'capacity-1',
          '2026-07-01',
        ),
      ],
      capacities: [{ id: 'capacity-1', capacityDate: '2026-08-01' }],
    });
    await invoke(onDeadline.service, 'expireNoShowRebooking', 'application-id');
    expect(onDeadline.application.status).toBe(ApplicationStatus.APPROVED);

    const replacement = fixtureFor({
      today: '2026-09-01',
      appointments: [
        appointment(
          'missed',
          AppointmentStatus.NO_SHOW,
          'capacity-1',
          '2026-07-01',
        ),
        appointment(
          'replacement',
          AppointmentStatus.COMPLETED,
          'capacity-2',
          '2026-08-30',
        ),
      ],
      capacities: [
        { id: 'capacity-1', capacityDate: '2026-08-01' },
        { id: 'capacity-2', capacityDate: '2026-09-15' },
      ],
    });
    await invoke(
      replacement.service,
      'expireNoShowRebooking',
      'application-id',
    );
    expect(replacement.application.status).toBe(ApplicationStatus.APPROVED);
  });

  it('uses NO_SHOW marking chronology, rather than original appointment booking chronology', async () => {
    const beforeNoShow = fixtureFor({
      today: '2026-09-01',
      appointments: [
        appointment(
          'missed',
          AppointmentStatus.NO_SHOW,
          'capacity-1',
          '2026-07-01',
        ),
        appointment(
          'old-booking',
          AppointmentStatus.SCHEDULED,
          'capacity-2',
          '2026-07-15',
        ),
      ],
      capacities: [
        { id: 'capacity-1', capacityDate: '2026-08-01' },
        { id: 'capacity-2', capacityDate: '2026-09-10' },
      ],
    });
    await invoke(
      beforeNoShow.service,
      'expireNoShowRebooking',
      'application-id',
    );
    expect(beforeNoShow.application.status).toBe(ApplicationStatus.CANCELLED);

    const unmarked = fixtureFor({
      today: '2026-09-01',
      appointments: [
        {
          ...appointment('missed', AppointmentStatus.NO_SHOW, 'capacity-1'),
          noShowMarkedAt: null,
        },
      ],
      capacities: [{ id: 'capacity-1', capacityDate: '2026-08-01' }],
    });
    await invoke(unmarked.service, 'expireNoShowRebooking', 'application-id');
    expect(unmarked.application.status).toBe(ApplicationStatus.APPROVED);
  });

  it('uses a unique, strictly due first-NO_SHOW candidate set and reports only real mutations', async () => {
    const fixture = fixtureFor({
      today: '2026-09-01',
      appointments: [
        appointment('missed', AppointmentStatus.NO_SHOW, 'capacity-1'),
      ],
      capacities: [{ id: 'capacity-1', capacityDate: '2026-08-01' }],
    });
    fixture.rawRows.push({ id: 'application-id' });

    await expect(
      fixture.service.processNoShowRebookingExpiries(),
    ).resolves.toEqual({
      scanned: 1,
      processed: 1,
      skipped: 0,
    });
    expect(fixture.builder.groupBy).toHaveBeenCalledWith(
      'appointment.applicationId',
    );
    expect(fixture.builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('completed_inspection'),
      expect.objectContaining({ completed: 'COMPLETED' }),
    );
    expect(fixture.builder.andWhere).toHaveBeenCalledWith(
      "capacity.capacity_date + INTERVAL '30 days' < (now() AT TIME ZONE 'Asia/Phnom_Penh')::date",
    );
    expect(fixture.builder.orderBy).toHaveBeenCalledWith(
      'MIN(capacity.capacityDate)',
      'ASC',
    );
    expect(fixture.builder.take).toHaveBeenCalledWith(100);

    await expect(
      fixture.service.processNoShowRebookingExpiries(),
    ).resolves.toEqual({
      scanned: 1,
      processed: 0,
      skipped: 1,
    });
  });

  it('orchestrates NO_SHOW processing before both expiry processors', async () => {
    const fixture = fixtureFor();
    const calls: string[] = [];
    jest
      .spyOn(fixture.service, 'processInitialInspectionExpiries')
      .mockImplementation(() => {
        calls.push('initial-expiry');
        return Promise.resolve({ scanned: 0, processed: 0, skipped: 0 });
      });
    jest
      .spyOn(fixture.service, 'processPastScheduledNoShows')
      .mockImplementation(() => {
        calls.push('no-show');
        return Promise.resolve({ scanned: 0, processed: 0, skipped: 0 });
      });
    jest
      .spyOn(fixture.service, 'processNoShowRebookingExpiries')
      .mockImplementation(() => {
        calls.push('no-show-expiry');
        return Promise.resolve({ scanned: 0, processed: 0, skipped: 0 });
      });
    jest
      .spyOn(fixture.service, 'processReinspectionDeadlineExpiries')
      .mockImplementation(() => {
        calls.push('reinspection-expiry');
        return Promise.resolve({ scanned: 0, processed: 0, skipped: 0 });
      });

    await fixture.service.processDueActions();

    expect(calls).toEqual([
      'initial-expiry',
      'no-show',
      'no-show-expiry',
      'reinspection-expiry',
    ]);
  });

  it('selects only overdue active submitted-at candidates without a completed Attempt #1', async () => {
    const fixture = fixtureFor({
      today: '2026-10-01',
      submittedAtDate: '2026-09-01',
    });
    fixture.initialRawRows.push({ id: 'application-id' });

    await expect(
      fixture.service.processInitialInspectionExpiries(),
    ).resolves.toEqual({
      scanned: 1,
      processed: 1,
      skipped: 0,
    });
    expect(fixture.initialBuilder.where).toHaveBeenCalledWith(
      'application."submitted_at" IS NOT NULL',
    );
    expect(fixture.initialBuilder.andWhere).toHaveBeenCalledWith(
      'application."status" IN (:...statuses)',
      {
        statuses: [
          ApplicationStatus.SUBMITTED,
          ApplicationStatus.UNDER_REVIEW,
          ApplicationStatus.CORRECTION_REQUIRED,
          ApplicationStatus.APPROVED,
        ],
      },
    );
    expect(fixture.initialBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(':periodDays - 1'),
      expect.objectContaining({
        periodDays: inspectionPolicy.application.initialInspectionPeriodDays,
      }),
    );
    expect(fixture.initialBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('first_attempt."attempt_number" = 1'),
      expect.objectContaining({ completed: InspectionStatus.COMPLETED }),
    );
  });

  it.each([
    [ApplicationStatus.SUBMITTED],
    [ApplicationStatus.UNDER_REVIEW],
    [ApplicationStatus.CORRECTION_REQUIRED],
    [ApplicationStatus.APPROVED],
  ])('expires overdue %s applications with system history', async (status) => {
    const fixture = fixtureFor({
      today: '2026-10-01',
      submittedAtDate: '2026-09-01',
      application: { status },
    });

    await invoke(fixture.service, 'expireInitialInspection', 'application-id');

    expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
    expect(fixture.history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: status,
        newStatus: ApplicationStatus.EXPIRED,
        changedByUserId: null,
        reason: 'INITIAL_INSPECTION_PERIOD_EXPIRED',
      }),
    );
  });

  it.each([
    ['Day 30', '2026-09-30', false],
    ['Day 31', '2026-10-01', true],
    ['after Day 31', '2026-10-10', true],
  ])(
    'uses Cambodia-local submitted-at dates at %s',
    async (_name, today, shouldExpire) => {
      const fixture = fixtureFor({
        today,
        submittedAtDate: '2026-09-01',
      });

      await invoke(
        fixture.service,
        'expireInitialInspection',
        'application-id',
      );

      expect(fixture.application.status).toBe(
        shouldExpire ? ApplicationStatus.EXPIRED : ApplicationStatus.APPROVED,
      );
    },
  );

  it.each([
    ApplicationStatus.DRAFT,
    ApplicationStatus.REJECTED,
    ApplicationStatus.CANCELLED,
    ApplicationStatus.EXPIRED,
    ApplicationStatus.INSPECTION_FAILED,
    ApplicationStatus.COMPLETED,
    ApplicationStatus.APPOINTMENT_SELECTION_REQUIRED,
    ApplicationStatus.REINSPECTION_REQUIRED,
  ])('does not expire excluded status %s', async (status) => {
    const fixture = fixtureFor({
      today: '2026-10-01',
      submittedAtDate: '2026-09-01',
      application: { status },
    });

    await invoke(fixture.service, 'expireInitialInspection', 'application-id');

    expect(fixture.application.status).toBe(status);
    expect(fixture.history.save).not.toHaveBeenCalled();
  });

  it.each([
    ['appointment-free PASS', InspectionResult.PASS, null],
    ['appointment-free FAIL', InspectionResult.FAIL, null],
    [
      'historical appointment-backed PASS',
      InspectionResult.PASS,
      'appointment-id',
    ],
  ])(
    'does not expire after completed Attempt #1: %s',
    async (_name, result, appointmentId) => {
      const fixture = fixtureFor({
        today: '2026-10-01',
        submittedAtDate: '2026-09-01',
        firstAttempt: {
          applicationId: 'application-id',
          attemptNumber: 1,
          status: InspectionStatus.COMPLETED,
          result,
          appointmentId,
          completedAt: new Date('2026-09-29T03:00:00Z'),
        },
      });

      await invoke(
        fixture.service,
        'expireInitialInspection',
        'application-id',
      );

      expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
      expect(fixture.history.save).not.toHaveBeenCalled();
    },
  );

  it('does not let payment or planning preferences pause the clock', async () => {
    const fixture = fixtureFor({
      today: '2026-10-01',
      submittedAtDate: '2026-09-01',
      application: {
        preferredInspectionDate: '2026-09-30',
        preferredInspectionStationId: null,
      },
      paymentStatus: 'CONFIRMED',
    });

    await invoke(fixture.service, 'expireInitialInspection', 'application-id');

    expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
    expect(fixture.paymentRepository).toBeUndefined();
  });

  it('is idempotent and rechecks Attempt #1 before the final transition', async () => {
    const fixture = fixtureFor({
      today: '2026-10-01',
      submittedAtDate: '2026-09-01',
    });
    fixture.initialRawRows.push({ id: 'application-id' });
    fixture.firstAttemptRepository.findOne.mockResolvedValueOnce({
      applicationId: 'application-id',
      attemptNumber: 1,
      status: InspectionStatus.COMPLETED,
      result: InspectionResult.PASS,
      completedAt: new Date('2026-09-30T03:00:00Z'),
    });

    await expect(
      fixture.service.processInitialInspectionExpiries(),
    ).resolves.toEqual({
      scanned: 1,
      processed: 0,
      skipped: 1,
    });
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);

    fixture.firstAttemptRepository.findOne.mockResolvedValue(null);
    await invoke(fixture.service, 'expireInitialInspection', 'application-id');
    await invoke(fixture.service, 'expireInitialInspection', 'application-id');
    expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
    expect(fixture.history.save).toHaveBeenCalledTimes(1);
  });

  it('marks an expired Attempt-1 FAIL as INSPECTION_FAILED, but defers an overdue scheduled replacement', async () => {
    const expired = fixtureFor({
      today: '2026-09-01',
      inspections: [fail()],
      appointments: [
        appointment(
          'fail-appointment',
          AppointmentStatus.COMPLETED,
          'capacity-1',
        ),
      ],
      capacities: [{ id: 'capacity-1', capacityDate: '2026-08-01' }],
    });
    await invoke(expired.service, 'expireReinspection', 'application-id');
    expect(expired.application.status).toBe(
      ApplicationStatus.INSPECTION_FAILED,
    );
    expect(expired.history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        changedByUserId: null,
        reason: 'REINSPECTION_DEADLINE_EXPIRED',
      }),
    );

    const deferred = fixtureFor({
      today: '2026-09-01',
      inspections: [fail()],
      appointments: [
        appointment(
          'fail-appointment',
          AppointmentStatus.COMPLETED,
          'capacity-1',
        ),
        appointment('replacement', AppointmentStatus.SCHEDULED, 'capacity-2'),
      ],
      capacities: [
        { id: 'capacity-1', capacityDate: '2026-08-01' },
        { id: 'capacity-2', capacityDate: '2026-08-31' },
      ],
    });
    await invoke(deferred.service, 'expireReinspection', 'application-id');
    expect(deferred.application.status).toBe(ApplicationStatus.APPROVED);
  });

  it.each(['2026-08-30', '2026-08-31'])(
    'does not expire Attempt-1 FAIL before or on its completion deadline (%s)',
    async (today) => {
      const fixture = fixtureFor({
        today,
        inspections: [fail()],
        appointments: [
          appointment(
            'fail-appointment',
            AppointmentStatus.COMPLETED,
            'capacity-1',
          ),
        ],
        capacities: [{ id: 'capacity-1', capacityDate: '2026-08-01' }],
      });

      await invoke(fixture.service, 'expireReinspection', 'application-id');

      expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
      expect(fixture.history.save).not.toHaveBeenCalled();
    },
  );

  it('skips terminal applications and a completed second physical inspection idempotently', async () => {
    const terminal = fixtureFor({
      application: { status: ApplicationStatus.CANCELLED },
    });
    await invoke(terminal.service, 'expireNoShowRebooking', 'application-id');
    expect(terminal.history.save).not.toHaveBeenCalled();

    const secondAttempt = fixtureFor({
      today: '2026-09-01',
      inspections: [
        fail(),
        { ...fail(), appointmentId: 'attempt-two', attemptNumber: 2 },
      ],
      appointments: [
        appointment(
          'fail-appointment',
          AppointmentStatus.COMPLETED,
          'capacity-1',
        ),
        appointment('attempt-two', AppointmentStatus.COMPLETED, 'capacity-2'),
      ],
      capacities: [
        { id: 'capacity-1', capacityDate: '2026-08-01' },
        { id: 'capacity-2', capacityDate: '2026-08-15' },
      ],
    });
    await invoke(secondAttempt.service, 'expireReinspection', 'application-id');
    expect(secondAttempt.application.status).toBe(ApplicationStatus.APPROVED);
    expect(secondAttempt.history.save).not.toHaveBeenCalled();
  });
});

function fixtureFor(overrides: Record<string, unknown> = {}) {
  const application = {
    id: 'application-id',
    status: ApplicationStatus.APPROVED,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    submittedAt: new Date('2026-09-01T03:00:00.000Z'),
  };
  Object.assign(application, overrides.application);
  const appointments = (overrides.appointments ?? []) as unknown[];
  const inspections = (overrides.inspections ?? []) as unknown[];
  const capacities = (overrides.capacities ?? []) as unknown[];
  const applicationRepository = {
    findOne: jest.fn().mockResolvedValue(application),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const appointmentRepository = {
    find: jest.fn().mockResolvedValue(appointments),
    createQueryBuilder: jest.fn(),
  };
  const inspectionRepository = {
    find: jest.fn().mockResolvedValue(inspections),
    findOne: jest.fn().mockResolvedValue(overrides.firstAttempt ?? null),
  };
  const capacityRepository = { find: jest.fn().mockResolvedValue(capacities) };
  const history = {
    create: jest.fn((value: unknown): unknown => value),
    save: jest.fn(),
  };
  const repositories = new Map<unknown, unknown>([
    [RenewalApplication, applicationRepository],
    [Appointment, appointmentRepository],
    [Inspection, inspectionRepository],
    [InspectionStationDailyCapacity, capacityRepository],
    [RenewalApplicationStatusHistory, history],
  ]);
  const initialBuilder = queryBuilder([]);
  applicationRepository.createQueryBuilder.mockReturnValue(initialBuilder);
  const builder = queryBuilder([]);
  appointmentRepository.createQueryBuilder.mockReturnValue(builder);
  const rawRows: { id: string }[] = [];
  const initialRawRows: { id: string }[] = [];
  builder.getRawMany.mockImplementation(() => Promise.resolve(rawRows));
  initialBuilder.getRawMany.mockImplementation(() =>
    Promise.resolve(initialRawRows),
  );
  const manager = {
    getRepository: jest.fn((entity: unknown): unknown =>
      repositories.get(entity),
    ),
    query: jest.fn().mockResolvedValue([
      {
        today: overrides.today ?? '2026-08-20',
        recordedAt: new Date('2026-09-01T00:00:00Z'),
        submittedAtDate: overrides.submittedAtDate ?? '2026-09-01',
      },
    ]),
  };
  const dataSource = {
    getRepository: jest.fn((entity: unknown): unknown =>
      repositories.get(entity),
    ),
    transaction: jest.fn(
      (callback: (value: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const commands = {
    markNoShowBySystem: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new InspectionExpiryService(
      dataSource as never,
      commands as never,
    ),
    application,
    history,
    commands,
    builder,
    initialBuilder,
    rawRows,
    initialRawRows,
    firstAttemptRepository: inspectionRepository,
    paymentRepository: undefined,
  };
}

function queryBuilder(rows: unknown[]) {
  const builder = {
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    groupBy: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    take: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  for (const method of [
    'innerJoin',
    'leftJoin',
    'groupBy',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'take',
  ] as const)
    builder[method].mockReturnValue(builder);
  return builder;
}
function appointment(
  id: string,
  status: AppointmentStatus,
  dailyCapacityId: string,
  bookedAt = '2026-07-01',
) {
  return {
    id,
    applicationId: 'application-id',
    status,
    dailyCapacityId,
    bookedAt: new Date(`${bookedAt}T00:00:00Z`),
    noShowMarkedAt:
      status === AppointmentStatus.NO_SHOW
        ? new Date('2026-08-01T00:00:00Z')
        : null,
  };
}
function fail() {
  return {
    appointmentId: 'fail-appointment',
    attemptNumber: 1,
    result: InspectionResult.FAIL,
    completedAt: new Date('2026-08-01T00:00:00Z'),
  };
}
async function invoke(
  service: InspectionExpiryService,
  method: string,
  id: string,
): Promise<void> {
  await (
    Reflect.get(service, method) as (
      this: InspectionExpiryService,
      value: string,
    ) => Promise<void>
  ).call(service, id);
}
