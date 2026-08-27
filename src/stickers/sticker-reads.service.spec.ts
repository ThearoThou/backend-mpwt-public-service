import { HttpStatus } from '@nestjs/common';

import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { StickerReadsService } from './sticker-reads.service';

describe('StickerReadsService', () => {
  it('lists one valid awaiting PASS application with deterministic eligibility and Cambodia summaries', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([row({ stickerId: null })])
      .mockResolvedValueOnce([
        { awaitingIssuance: 1, issuedToday: 2, issuedThisMonth: 3 },
      ]);
    const service = new StickerReadsService({ query } as never);
    await expect(
      service.listAdmin({
        view: 'AWAITING',
        page: 1,
        limit: 20,
        sortOrder: 'desc',
      }),
    ).resolves.toMatchObject({
      data: [{ applicationId: 'application-id', sticker: null }],
      meta: { total: 1 },
      summary: { awaitingIssuance: 1, issuedToday: 2, issuedThisMonth: 3 },
    });
    expect(querySql(query, 0)).toContain('pass."passCount" = 1');
    expect(querySql(query, 0)).toContain('sticker."id" IS NULL');
    expect(querySql(query, 0)).toContain(
      'passed."completedAt" ASC, application."id" ASC',
    );
    expect(querySql(query, 0)).toContain('i."actual_station_id"');
    expect(querySql(query, 0)).toContain('COALESCE(actual_station."id"');
    expect(querySql(query, 1)).toContain("AT TIME ZONE 'Asia/Phnom_Penh'");
  });

  it('lists issued rows only from stickers, never inferred application status', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        row({
          stickerId: 'sticker-id',
          stickerNumber: 'ABC123',
          issuedAt: new Date(),
        }),
      ])
      .mockResolvedValueOnce([
        { awaitingIssuance: 0, issuedToday: 1, issuedThisMonth: 1 },
      ]);
    const service = new StickerReadsService({ query } as never);
    await expect(
      service.listAdmin({
        view: 'ISSUED',
        page: 1,
        limit: 20,
        sortOrder: 'desc',
      }),
    ).resolves.toMatchObject({
      data: [{ sticker: { id: 'sticker-id', stickerNumber: 'ABC123' } }],
    });
    expect(querySql(query, 0)).toContain('FROM "stickers" sticker');
  });

  it('presents a qualifying own application as READY_FOR_ISSUANCE', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ citizenId: 'citizen-id' }])
      .mockResolvedValueOnce([row({ stickerId: null })]);
    const service = new StickerReadsService({ query } as never);
    await expect(
      service.getCitizenStatus('citizen-id', 'application-id'),
    ).resolves.toMatchObject({
      state: 'READY_FOR_ISSUANCE',
      station: { id: 'station-id' },
      sticker: null,
    });
  });

  it('presents an issued sticker without leaking issuer identity', async () => {
    const service = new StickerReadsService({
      query: jest.fn().mockResolvedValue([
        row({
          stickerId: 'sticker-id',
          stickerNumber: 'ABC123',
          issuedAt: new Date(),
        }),
      ]),
    } as never);
    const result = await service.getAdminDetail('application-id');
    expect(result).toMatchObject({
      state: 'ISSUED',
      actions: { canIssueSticker: false },
      sticker: { stickerNumber: 'ABC123' },
    });
    expect(result).not.toHaveProperty('issuedByUserId');
  });

  it('returns NOT_READY for no PASS and rejects another citizen and ambiguous PASS data', async () => {
    const noPass = new StickerReadsService({
      query: jest.fn().mockResolvedValue([
        row({
          passCount: 0,
          inspectionId: null,
          completedAt: null,
          stationId: null,
        }),
      ]),
    } as never);
    await expect(
      noPass.getAdminDetail('application-id'),
    ).resolves.toMatchObject({
      state: 'NOT_READY',
      actions: { canIssueSticker: false },
    });
    const foreign = new StickerReadsService({
      query: jest.fn().mockResolvedValueOnce([{ citizenId: 'other' }]),
    } as never);
    await expect(
      foreign.getCitizenStatus('citizen-id', 'application-id'),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    const corrupt = new StickerReadsService({
      query: jest.fn().mockResolvedValue([row({ passCount: 2 })]),
    } as never);
    await expect(
      corrupt.getAdminDetail('application-id'),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });
});

function row(overrides: Record<string, unknown>) {
  return {
    applicationId: 'application-id',
    referenceNumber: 'REF-1',
    applicationStatus: ApplicationStatus.APPROVED,
    vehicleSnapshot: {
      registrationNumber: 'REG-1',
      plateNumber: '1A',
      make: 'Test',
      model: 'Car',
    },
    applicantSnapshot: { fullNameKh: 'Citizen' },
    passCount: 1,
    inspectionId: 'inspection-id',
    attemptNumber: 1,
    completedAt: new Date('2026-08-17T00:00:00.000Z'),
    stationId: 'station-id',
    stationCode: 'ST-1',
    stationNameKh: 'Station',
    stationNameEn: 'Station',
    stickerId: null,
    stickerNumber: null,
    issuedAt: null,
    total: 1,
    ...overrides,
  };
}

function querySql(query: jest.Mock, index: number): string {
  const calls = query.mock.calls as unknown as unknown[][];
  const value = calls[index]?.[0];
  return typeof value === 'string' ? value : '';
}
