import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { InspectionStation } from '../scheduling/entities/inspection-station.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { AppointmentStatus } from '../scheduling/enums/appointment-status.enum';
import { InspectionResult } from './enums/inspection-result.enum';
import { Inspection } from './entities/inspection.entity';
import { InspectionReplacementSchedulingService } from './inspection-replacement-scheduling.service';

describe('InspectionReplacementSchedulingService branch derivation', () => {
  const service = new InspectionReplacementSchedulingService(
    {} as never,
    {} as never,
    {} as never,
  );
  const derive = Reflect.get(service, 'derive') as (
    state: unknown,
    today: string,
  ) => { reason: string; deadline: string };

  it('uses the original FAIL deadline after one NO_SHOW', () => {
    expect(
      derive(
        state({
          inspections: [fail()],
          appointments: [
            appointment('fail-appointment', AppointmentStatus.COMPLETED),
            appointment('no-show', AppointmentStatus.NO_SHOW),
          ],
          dates: new Map([
            ['fail-appointment', '2026-08-01'],
            ['no-show', '2026-08-10'],
          ]),
        }),
        '2026-08-20',
      ),
    ).toEqual({ reason: 'REINSPECTION', deadline: '2026-08-31' });
  });

  it('rejects legacy FAIL anchors, two NO_SHOWs, scheduled appointments, and deadline-day reinspection', () => {
    expect(() =>
      derive(
        state({
          inspections: [fail()],
          appointments: [
            appointment('fail-appointment', AppointmentStatus.COMPLETED, null),
          ],
        }),
        '2026-08-20',
      ),
    ).toThrow();
    expect(() =>
      derive(
        state({
          inspections: [fail()],
          appointments: [
            appointment('fail-appointment', AppointmentStatus.COMPLETED),
            appointment('one', AppointmentStatus.NO_SHOW),
            appointment('two', AppointmentStatus.NO_SHOW),
          ],
          dates: new Map([
            ['fail-appointment', '2026-08-01'],
            ['one', '2026-08-02'],
            ['two', '2026-08-03'],
          ]),
        }),
        '2026-08-20',
      ),
    ).toThrow();
    expect(() =>
      derive(
        state({
          appointments: [appointment('scheduled', AppointmentStatus.SCHEDULED)],
        }),
        '2026-08-20',
      ),
    ).toThrow();
    expect(() =>
      derive(
        state({
          inspections: [fail()],
          appointments: [
            appointment('fail-appointment', AppointmentStatus.COMPLETED),
          ],
          dates: new Map([['fail-appointment', '2026-08-01']]),
        }),
        '2026-08-31',
      ),
    ).toThrow();
  });

  it('allows first NO_SHOW on its inclusive booking deadline without truncating its future selection branch', () => {
    expect(
      derive(
        state({
          appointments: [appointment('no-show', AppointmentStatus.NO_SHOW)],
          dates: new Map([['no-show', '2026-08-01']]),
        }),
        '2026-08-31',
      ),
    ).toEqual({ reason: 'NO_SHOW_REPLACEMENT', deadline: '2026-08-31' });
  });

  it('books reinspection through the locked transaction and atomic capacity reservation', async () => {
    const fixture = bookingFixture();
    const result = await fixture.service.book('citizen-id', 'application-id', {
      stationId: 'station-id',
      capacityDate: '2026-08-21',
    });

    expect(fixture.applicationRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'application-id', citizenId: 'citizen-id' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(fixture.reserve).toHaveBeenCalledWith(
      fixture.manager,
      'station-id',
      '2026-08-21',
    );
    expect(fixture.appointmentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'application-id',
        dailyCapacityId: 'reserved-capacity-id',
        slotId: null,
        status: AppointmentStatus.SCHEDULED,
      }),
    );
    expect(result).toMatchObject({
      appointmentId: 'new-appointment-id',
      bookingReason: 'REINSPECTION',
      capacityDate: '2026-08-21',
    });
    expect(typeof result.capacityDate).toBe('string');
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
    expect(fixture.paymentRepository.save).not.toHaveBeenCalled();
  });

  it('accepts the reinspection deadline date but rejects today and dates after it', async () => {
    await expect(
      bookingFixture().service.book('citizen-id', 'application-id', {
        stationId: 'station-id',
        capacityDate: '2026-08-31',
      }),
    ).resolves.toBeDefined();
    await expect(
      bookingFixture().service.book('citizen-id', 'application-id', {
        stationId: 'station-id',
        capacityDate: '2026-08-20',
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      bookingFixture().service.book('citizen-id', 'application-id', {
        stationId: 'station-id',
        capacityDate: '2026-09-01',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('books first-NO_SHOW replacements through and after the inclusive booking deadline', async () => {
    for (const capacityDate of ['2026-08-21', '2026-08-31', '2026-09-01']) {
      const fixture = bookingFixture();
      fixture.inspectionRepository.find.mockResolvedValue([]);
      fixture.appointmentRepository.find.mockResolvedValue([
        appointment('no-show', AppointmentStatus.NO_SHOW),
      ]);
      fixture.capacityRepository.find.mockResolvedValue([
        { id: 'capacity-id', capacityDate: '2026-08-01' },
      ]);
      await expect(
        fixture.service.book('citizen-id', 'application-id', {
          stationId: 'station-id',
          capacityDate,
        }),
      ).resolves.toMatchObject({ bookingReason: 'NO_SHOW_REPLACEMENT' });
    }
  });

  it('books after one NO_SHOW using the original Attempt-1 FAIL deadline', async () => {
    const fixture = bookingFixture();
    fixture.appointmentRepository.find.mockResolvedValue([
      appointment('fail-appointment', AppointmentStatus.COMPLETED),
      appointment('no-show', AppointmentStatus.NO_SHOW),
    ]);
    fixture.capacityRepository.find.mockResolvedValue([
      { id: 'capacity-id', capacityDate: '2026-08-01' },
      { id: 'old-capacity-id', capacityDate: '2026-08-01' },
    ]);
    await expect(
      fixture.service.book('citizen-id', 'application-id', {
        stationId: 'station-id',
        capacityDate: '2026-08-31',
      }),
    ).resolves.toMatchObject({
      bookingReason: 'REINSPECTION',
    });
  });

  it('normalizes only the scheduled-appointment unique race', async () => {
    const duplicate = bookingFixture({
      saveError: {
        code: '23505',
        constraint: 'uq_scheduled_appointment_per_application',
      },
    });
    await expect(
      duplicate.service.book('citizen-id', 'application-id', {
        stationId: 'station-id',
        capacityDate: '2026-08-21',
      }),
    ).rejects.toMatchObject({ status: 409 });
    const other = bookingFixture({
      saveError: { code: '23505', constraint: 'other_constraint' },
    });
    await expect(
      other.service.book('citizen-id', 'application-id', {
        stationId: 'station-id',
        capacityDate: '2026-08-21',
      }),
    ).rejects.toEqual(other.saveError);
    expect(other.appointmentRepository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects direct booking when ownership, application, payment, or workflow eligibility is invalid', async () => {
    const input = { stationId: 'station-id', capacityDate: '2026-08-21' };
    const notOwned = bookingFixture();
    notOwned.applicationRepository.findOne.mockResolvedValue(null);
    await expect(
      notOwned.service.book('citizen-id', 'application-id', input),
    ).rejects.toMatchObject({ status: 404 });

    const unapproved = bookingFixture();
    unapproved.application.status = ApplicationStatus.REJECTED;
    await expect(
      unapproved.service.book('citizen-id', 'application-id', input),
    ).rejects.toMatchObject({ status: 409 });

    const missingPayment = bookingFixture();
    missingPayment.paymentRepository.findOne.mockResolvedValue(null);
    await expect(
      missingPayment.service.book('citizen-id', 'application-id', input),
    ).rejects.toMatchObject({ status: 409 });

    const unpaid = bookingFixture();
    unpaid.paymentRepository.findOne.mockResolvedValue({
      applicationId: 'application-id',
      status: 'PENDING',
    });
    await expect(
      unpaid.service.book('citizen-id', 'application-id', input),
    ).rejects.toMatchObject({ status: 409 });

    const passed = bookingFixture();
    passed.inspectionRepository.find.mockResolvedValue([
      { ...fail(), result: InspectionResult.PASS },
    ]);
    await expect(
      passed.service.book('citizen-id', 'application-id', input),
    ).rejects.toMatchObject({ status: 409 });

    const scheduled = bookingFixture();
    scheduled.appointmentRepository.find.mockResolvedValue([
      appointment('scheduled', AppointmentStatus.SCHEDULED),
    ]);
    await expect(
      scheduled.service.book('citizen-id', 'application-id', input),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects two attempts, two NO_SHOWs, invalid branches, and legacy FAIL anchors before reserving', async () => {
    const input = { stationId: 'station-id', capacityDate: '2026-08-21' };
    const cases = [
      (() => {
        const fixture = bookingFixture();
        fixture.inspectionRepository.find.mockResolvedValue([fail(), fail()]);
        return fixture;
      })(),
      (() => {
        const fixture = bookingFixture();
        fixture.appointmentRepository.find.mockResolvedValue([
          appointment('one', AppointmentStatus.NO_SHOW),
          appointment('two', AppointmentStatus.NO_SHOW),
        ]);
        return fixture;
      })(),
      (() => {
        const fixture = bookingFixture();
        fixture.inspectionRepository.find.mockResolvedValue([]);
        fixture.appointmentRepository.find.mockResolvedValue([]);
        return fixture;
      })(),
      (() => {
        const fixture = bookingFixture();
        fixture.appointmentRepository.find.mockResolvedValue([
          appointment('fail-appointment', AppointmentStatus.COMPLETED, null),
        ]);
        return fixture;
      })(),
    ];
    for (const fixture of cases) {
      await expect(
        fixture.service.book('citizen-id', 'application-id', input),
      ).rejects.toMatchObject({ status: 409 });
      expect(fixture.reserve).not.toHaveBeenCalled();
    }
  });

  it('returns the exact REINSPECTION availability window and leaves NO_SHOW dates untruncated', async () => {
    const dates = [
      { capacityDate: '2026-08-21' },
      { capacityDate: '2026-08-31' },
      { capacityDate: '2026-09-01' },
    ];
    const reinspection = bookingFixture();
    reinspection.availability.listSelectableDates.mockResolvedValue(dates);
    await expect(
      reinspection.service.availableDates(
        'citizen-id',
        'application-id',
        'station-id',
      ),
    ).resolves.toEqual({
      applicationId: 'application-id',
      stationId: 'station-id',
      bookingReason: 'REINSPECTION',
      bookingDeadline: null,
      reinspectionDeadline: '2026-08-31',
      availableDates: [
        { capacityDate: '2026-08-21' },
        { capacityDate: '2026-08-31' },
      ],
    });

    const noShow = bookingFixture();
    noShow.inspectionRepository.find.mockResolvedValue([]);
    noShow.appointmentRepository.find.mockResolvedValue([
      appointment('no-show', AppointmentStatus.NO_SHOW),
    ]);
    noShow.capacityRepository.find.mockResolvedValue([
      { id: 'capacity-id', capacityDate: '2026-08-01' },
    ]);
    noShow.availability.listSelectableDates.mockResolvedValue(dates);
    await expect(
      noShow.service.availableDates(
        'citizen-id',
        'application-id',
        'station-id',
      ),
    ).resolves.toMatchObject({
      bookingReason: 'NO_SHOW_REPLACEMENT',
      bookingDeadline: '2026-08-31',
      reinspectionDeadline: null,
      availableDates: dates,
    });
  });
});

function bookingFixture(overrides: Record<string, unknown> = {}) {
  const application = {
    id: 'application-id',
    citizenId: 'citizen-id',
    status: ApplicationStatus.APPROVED,
    preferredInspectionStationId: null,
    preferredInspectionDate: null,
  };
  const payment = { applicationId: application.id, status: 'CONFIRMED' };
  const oldAppointment = {
    id: 'fail-appointment',
    applicationId: application.id,
    dailyCapacityId: 'old-capacity-id',
    status: AppointmentStatus.COMPLETED,
  };
  const applicationRepository = repo(application);
  const paymentRepository = repo(payment);
  const inspectionRepository = {
    ...repo(null),
    find: jest.fn().mockResolvedValue([fail()]),
  };
  const appointmentRepository = {
    ...repo(null),
    find: jest.fn().mockResolvedValue([oldAppointment]),
    create: jest.fn((value: unknown): unknown => value),
    save: jest.fn().mockResolvedValue({
      id: 'new-appointment-id',
      status: AppointmentStatus.SCHEDULED,
    }),
  };
  const capacityRepository = {
    ...repo(null),
    find: jest
      .fn()
      .mockResolvedValue([
        { id: 'old-capacity-id', capacityDate: '2026-08-01' },
      ]),
  };
  const stationRepository = repo({
    id: 'station-id',
    code: 'ST-1',
    nameKh: 'Station Kh',
    nameEn: 'Station',
  });
  const repositories = new Map<unknown, unknown>([
    [RenewalApplication, applicationRepository],
    [Payment, paymentRepository],
    [Inspection, inspectionRepository],
    [Appointment, appointmentRepository],
    [InspectionStationDailyCapacity, capacityRepository],
    [InspectionStation, stationRepository],
  ]);
  const manager = {
    getRepository: jest.fn((entity: unknown): unknown =>
      repositories.get(entity),
    ),
    query: jest.fn().mockResolvedValue([{ today: '2026-08-20' }]),
  };
  const saveError = overrides.saveError;
  if (saveError !== undefined)
    appointmentRepository.save.mockRejectedValue(saveError);
  const dataSource = {
    transaction: jest.fn(
      (callback: (transactionManager: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
    getRepository: jest.fn((entity: unknown): unknown =>
      repositories.get(entity),
    ),
    query: jest.fn().mockResolvedValue([{ today: '2026-08-20' }]),
  };
  const reserve = jest.fn().mockResolvedValue({
    id: 'reserved-capacity-id',
    stationId: 'station-id',
    capacityDate: '2026-08-21',
  });
  const availability = { listSelectableDates: jest.fn() };
  return {
    service: new InspectionReplacementSchedulingService(
      dataSource as never,
      { reserveDailyCapacityWithManager: reserve } as never,
      availability as never,
    ),
    manager,
    reserve,
    application,
    applicationRepository,
    paymentRepository,
    inspectionRepository,
    appointmentRepository,
    capacityRepository,
    availability,
    saveError,
  };
}
function repo(value: unknown) {
  return {
    findOne: jest.fn().mockResolvedValue(value),
    find: jest.fn(),
    create: jest.fn((input: unknown): unknown => input),
    save: jest.fn().mockResolvedValue(value),
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    application: { status: ApplicationStatus.APPROVED },
    inspections: [],
    appointments: [],
    dates: new Map(),
    today: '2026-08-20',
    ...overrides,
  };
}
function appointment(
  id: string,
  status: AppointmentStatus,
  dailyCapacityId: string | null = 'capacity-id',
) {
  return { id, status, dailyCapacityId };
}
function fail() {
  return {
    appointmentId: 'fail-appointment',
    attemptNumber: 1,
    result: InspectionResult.FAIL,
    completedAt: new Date('2026-08-01T01:00:00Z'),
  };
}
