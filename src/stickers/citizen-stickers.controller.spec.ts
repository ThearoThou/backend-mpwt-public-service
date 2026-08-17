import { CitizenStickersController } from './citizen-stickers.controller';

describe('CitizenStickersController', () => {
  it('uses the authenticated citizen identity and wraps the safe result', async () => {
    const reads = {
      getCitizenStatus: jest
        .fn()
        .mockResolvedValue({ state: 'READY_FOR_ISSUANCE' }),
    };
    const controller = new CitizenStickersController(reads as never);
    await expect(
      controller.status('00000000-0000-4000-8000-000000000001', {
        userId: 'citizen-id',
      } as never),
    ).resolves.toEqual({ data: { state: 'READY_FOR_ISSUANCE' } });
    expect(reads.getCitizenStatus).toHaveBeenCalledWith(
      'citizen-id',
      '00000000-0000-4000-8000-000000000001',
    );
  });
});
