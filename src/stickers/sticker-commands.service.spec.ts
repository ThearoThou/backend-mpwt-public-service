import { HttpStatus } from '@nestjs/common';

import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { Sticker } from './entities/sticker.entity';
import { StickerCommandsService } from './sticker-commands.service';

describe('StickerCommandsService', () => {
  it('atomically creates a sticker while leaving the active application unchanged', async () => {
    const fixture = managerFixture();
    const reads = {
      getAdminDetail: jest.fn().mockResolvedValue({ state: 'ISSUED' }),
    };
    const dataSource = {
      transaction: jest.fn((work: (manager: unknown) => Promise<unknown>) =>
        work(fixture.manager),
      ),
    };
    const service = new StickerCommandsService(
      dataSource as never,
      reads as never,
    );
    await expect(
      service.issue('application-id', 'admin-id', {
        stickerNumber: 'ABC123',
      }),
    ).resolves.toEqual({ state: 'ISSUED' });
    expect(fixture.stickerSave).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'application-id',
        inspectionId: 'inspection-id',
        stickerNumber: 'ABC123',
        issuedByUserId: 'admin-id',
        issuedAt: fixture.now,
      }),
    );
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
    expect(fixture.application.completedAt).toBeNull();
    expect(fixture.applicationSave).not.toHaveBeenCalled();
    expect(fixture.historySave).not.toHaveBeenCalled();
    expect(fixture.inspectionFind).toHaveBeenCalledWith({
      where: {
        applicationId: 'application-id',
        attemptNumber: 1,
        status: InspectionStatus.COMPLETED,
        result: InspectionResult.PASS,
      },
    });
  });

  it.each([
    [
      'not approved',
      { status: ApplicationStatus.REJECTED },
      HttpStatus.CONFLICT,
    ],
    [
      'primary FAIL is terminal',
      { status: ApplicationStatus.INSPECTION_FAILED, passes: [] },
      HttpStatus.CONFLICT,
    ],
    ['zero PASS', { passes: [] }, HttpStatus.CONFLICT],
    ['multiple PASS', { passes: [pass(), pass()] }, HttpStatus.CONFLICT],
    ['payment is pending', { paymentStatus: PaymentStatus.PENDING }, 409],
    ['readiness is missing', { readyForInspectionAt: null }, 409],
    ['submission timestamp is missing', { submittedAt: null }, 409],
    [
      'PASS has no completion timestamp',
      { passes: [pass({ completedAt: null })] },
      409,
    ],
    ['only legacy attempt 2 passed', { passes: [] }, HttpStatus.CONFLICT],
    [
      'legacy slot pass',
      {
        appointment: {
          id: 'appointment-id',
          dailyCapacityId: null,
          slotId: null,
        },
      },
      HttpStatus.CONFLICT,
    ],
    ['already issued', { appSticker: true }, HttpStatus.CONFLICT],
  ])('rejects %s issuance state', async (_name, changes, status) => {
    const fixture = managerFixture(changes);
    const service = new StickerCommandsService(
      {
        transaction: (work: (manager: unknown) => Promise<unknown>) =>
          work(fixture.manager),
      } as never,
      { getAdminDetail: jest.fn() } as never,
    );
    await expect(
      service.issue('application-id', 'admin-id', {
        stickerNumber: 'ABC123',
      }),
    ).rejects.toMatchObject({ status });
    expect(fixture.stickerSave).not.toHaveBeenCalled();
  });

  it('issues from an appointment-free PASS when its actual station is recorded', async () => {
    const fixture = managerFixture({
      passes: [
        {
          ...pass(),
          appointmentId: null,
          actualStationId: 'station-id',
        },
      ],
    });
    const service = new StickerCommandsService(
      {
        transaction: (work: (manager: unknown) => Promise<unknown>) =>
          work(fixture.manager),
      } as never,
      {
        getAdminDetail: jest.fn().mockResolvedValue({ state: 'ISSUED' }),
      } as never,
    );

    await expect(
      service.issue('application-id', 'admin-id', { stickerNumber: 'ABC123' }),
    ).resolves.toMatchObject({ state: 'ISSUED' });
  });

  it('expires on Day 31 and does not issue a sticker', async () => {
    const fixture = managerFixture({
      submittedAt: new Date('2026-07-18T01:00:00.000Z'),
      now: new Date('2026-08-16T17:00:00.000Z'),
    });
    const service = new StickerCommandsService(
      {
        transaction: (work: (manager: unknown) => Promise<unknown>) =>
          work(fixture.manager),
      } as never,
      { getAdminDetail: jest.fn() } as never,
    );

    await expect(
      service.issue('application-id', 'admin-id', { stickerNumber: 'ABC123' }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

    expect(fixture.application.status).toBe(ApplicationStatus.EXPIRED);
    expect(fixture.historySave).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: ApplicationStatus.APPROVED,
        newStatus: ApplicationStatus.EXPIRED,
      }),
    );
    expect(fixture.stickerSave).not.toHaveBeenCalled();
  });

  it('serializes concurrent issuance so one sticker wins without application completion history', async () => {
    const fixture = managerFixture();
    let tail = Promise.resolve();
    const dataSource = {
      transaction: jest.fn((work: (manager: unknown) => Promise<unknown>) => {
        const result = tail.then(() => work(fixture.manager));
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      }),
    };
    const reads = {
      getAdminDetail: jest.fn().mockResolvedValue({ state: 'ISSUED' }),
    };
    const service = new StickerCommandsService(
      dataSource as never,
      reads as never,
    );

    const results = await Promise.allSettled([
      service.issue('application-id', 'admin-1', { stickerNumber: 'ABC123' }),
      service.issue('application-id', 'admin-2', { stickerNumber: 'XYZ789' }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(fixture.stickerSave).toHaveBeenCalledTimes(1);
    expect(fixture.application.status).toBe(ApplicationStatus.APPROVED);
    expect(fixture.application.completedAt).toBeNull();
    expect(fixture.historySave).not.toHaveBeenCalled();
  });
});

function pass(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inspection-id',
    appointmentId: 'appointment-id',
    actualStationId: null,
    applicationId: 'application-id',
    attemptNumber: 1,
    status: InspectionStatus.COMPLETED,
    result: InspectionResult.PASS,
    completedAt: new Date('2026-08-17T00:00:00.000Z'),
    ...overrides,
  };
}

function managerFixture(changes: Record<string, unknown> = {}) {
  const now =
    (changes.now as Date | undefined) ?? new Date('2026-08-17T00:00:00.000Z');
  const application = {
    id: 'application-id',
    status: ApplicationStatus.APPROVED,
    submittedAt: new Date('2026-08-01T00:00:00.000Z') as Date | null,
    readyForInspectionAt: new Date('2026-08-02T00:00:00.000Z') as Date | null,
    completedAt: null as Date | null,
    ...(changes.status ? { status: changes.status as ApplicationStatus } : {}),
  };
  if (Object.prototype.hasOwnProperty.call(changes, 'submittedAt'))
    application.submittedAt = changes.submittedAt as Date | null;
  if (Object.prototype.hasOwnProperty.call(changes, 'readyForInspectionAt'))
    application.readyForInspectionAt =
      changes.readyForInspectionAt as Date | null;
  let stickerIssued = changes.appSticker === true;
  const stickerSave = jest.fn().mockImplementation(() => {
    stickerIssued = true;
    return Promise.resolve(undefined);
  });
  const historySave = jest.fn().mockResolvedValue(undefined);
  const appRepository = {
    createQueryBuilder: () => ({
      setLock: () => ({
        where: () => ({ getOne: jest.fn().mockResolvedValue(application) }),
      }),
    }),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const inspectionRepository = {
    find: jest.fn().mockResolvedValue(changes.passes ?? [pass()]),
  };
  const paymentRepository = {
    findOne: jest.fn().mockResolvedValue({
      applicationId: application.id,
      status:
        (changes.paymentStatus as PaymentStatus | undefined) ??
        PaymentStatus.CONFIRMED,
    }),
  };
  const appointmentRepository = {
    findOne: jest.fn().mockResolvedValue(
      changes.appointment ?? {
        id: 'appointment-id',
        dailyCapacityId: 'capacity-id',
        slotId: null,
      },
    ),
  };
  const stickerRepository = {
    exists: jest
      .fn()
      .mockImplementation(
        ({
          where,
        }: {
          where: { applicationId?: string; inspectionId?: string };
        }) =>
          Promise.resolve(
            where.applicationId
              ? stickerIssued
              : changes.inspectionSticker === true,
          ),
      ),
    create: jest.fn((value: unknown) => value),
    save: stickerSave,
  };
  const historyRepository = {
    create: jest.fn((value: unknown) => value),
    save: historySave,
  };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === Sticker
        ? stickerRepository
        : entity === Payment
          ? paymentRepository
          : entity === Appointment
            ? appointmentRepository
            : (entity as { name?: string }).name === 'RenewalApplication'
              ? appRepository
              : (entity as { name?: string }).name === 'Inspection'
                ? inspectionRepository
                : historyRepository,
    query: jest.fn().mockResolvedValue([{ now }]),
  };
  return {
    manager,
    now,
    application,
    stickerSave,
    historySave,
    applicationSave: appRepository.save,
    inspectionFind: inspectionRepository.find,
  };
}
