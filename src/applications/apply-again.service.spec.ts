import { ApplicationStatus } from './enums/application-status.enum';
import { ApplyAgainService } from './apply-again.service';

describe('ApplyAgainService', () => {
  it('uses replacement mechanics with INSPECTION_FAILED as the only eligible source status', async () => {
    const replacements = {
      createReplacementDraft: jest.fn().mockResolvedValue({
        id: 'new-draft',
        status: ApplicationStatus.DRAFT,
      }),
    };
    const service = new ApplyAgainService(replacements as never);

    await expect(
      service.applyAgain('citizen-id', 'failed-application-id'),
    ).resolves.toMatchObject({ id: 'new-draft', status: 'DRAFT' });
    expect(replacements.createReplacementDraft).toHaveBeenCalledWith(
      'citizen-id',
      'failed-application-id',
      expect.objectContaining({ status: ApplicationStatus.INSPECTION_FAILED }),
    );
  });
});
