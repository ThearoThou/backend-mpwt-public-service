import { PublicCertificatesController } from './public-certificates.controller';

describe('PublicCertificatesController', () => {
  it('delegates the certificate number to the read-only verification service', async () => {
    const verification = {
      certificateNumber: 'MPWT-001',
      inspectionDate: new Date('2026-10-14T00:00:00.000Z'),
      expiryDate: '2027-10-14',
      issuedAt: new Date('2026-10-14T00:00:00.000Z'),
      isValid: true,
    };
    const reads = {
      getPublicVerification: jest.fn().mockResolvedValue(verification),
    };
    const controller = new PublicCertificatesController(reads as never);

    await expect(controller.verify('MPWT-001')).resolves.toEqual({
      data: verification,
    });
    expect(reads.getPublicVerification).toHaveBeenCalledWith('MPWT-001');
  });
});
