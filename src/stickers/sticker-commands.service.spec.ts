import { HttpStatus } from '@nestjs/common';

import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { Sticker } from './entities/sticker.entity';
import { StickerCommandsService } from './sticker-commands.service';

describe('StickerCommandsService', () => {
  it('atomically creates a trimmed sticker, completes the application, and writes history', async () => {
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
      }),
    );
    expect(fixture.application.status).toBe(ApplicationStatus.COMPLETED);
    expect(fixture.application.completedAt).toEqual(fixture.now);
    expect(fixture.historySave).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStatus: ApplicationStatus.APPROVED,
        newStatus: ApplicationStatus.COMPLETED,
        changedByUserId: 'admin-id',
        reason: 'STICKER_ISSUED',
      }),
    );
  });

  it.each([
    [
      'not approved',
      { status: ApplicationStatus.REJECTED },
      HttpStatus.CONFLICT,
    ],
    ['zero PASS', { passes: [] }, HttpStatus.CONFLICT],
    ['multiple PASS', { passes: [pass(), pass()] }, HttpStatus.CONFLICT],
    [
      'legacy slot pass',
      { appointment: { id: 'appointment-id', dailyCapacityId: null } },
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
});

function pass() {
  return {
    id: 'inspection-id',
    appointmentId: 'appointment-id',
    applicationId: 'application-id',
    status: InspectionStatus.COMPLETED,
    result: InspectionResult.PASS,
  };
}

function managerFixture(changes: Record<string, unknown> = {}) {
  const now = new Date('2026-08-17T00:00:00.000Z');
  const application = {
    id: 'application-id',
    status: ApplicationStatus.APPROVED,
    completedAt: null as Date | null,
    ...(changes.status ? { status: changes.status as ApplicationStatus } : {}),
  };
  const stickerSave = jest.fn().mockResolvedValue(undefined);
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
  const appointmentRepository = {
    findOne: jest.fn().mockResolvedValue(
      changes.appointment ?? {
        id: 'appointment-id',
        dailyCapacityId: 'capacity-id',
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
              ? changes.appSticker === true
              : changes.inspectionSticker === true,
          ),
      ),
    create: jest.fn((value: unknown) => value),
    save: stickerSave,
  };
  const historyRepository = { save: historySave };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === Sticker
        ? stickerRepository
        : entity === Appointment
          ? appointmentRepository
          : (entity as { name?: string }).name === 'RenewalApplication'
            ? appRepository
            : (entity as { name?: string }).name === 'Inspection'
              ? inspectionRepository
              : historyRepository,
    query: jest.fn().mockResolvedValue([{ now }]),
  };
  return { manager, now, application, stickerSave, historySave };
}
