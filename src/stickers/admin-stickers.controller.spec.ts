import { AdminStickersController } from './admin-stickers.controller';

describe('AdminStickersController', () => {
  it('delegates list and UUID detail reads to the read service', async () => {
    const reads = {
      listAdmin: jest
        .fn()
        .mockResolvedValue({ data: [], meta: {}, summary: {} }),
      getAdminDetail: jest.fn().mockResolvedValue({ state: 'NOT_READY' }),
    };
    const controller = new AdminStickersController(reads as never);
    await expect(
      controller.list({
        view: 'AWAITING',
        page: 1,
        limit: 20,
        sortOrder: 'desc',
      }),
    ).resolves.toEqual({ data: [], meta: {}, summary: {} });
    await expect(
      controller.detail('00000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({ data: { state: 'NOT_READY' } });
  });
});
