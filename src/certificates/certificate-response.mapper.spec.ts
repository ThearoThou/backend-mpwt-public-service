import { mapTechnicalInspectionCertificateResponse } from './certificate-response.mapper';

describe('technical inspection certificate response', () => {
  it('returns a citizen-safe not-issued contract for legacy records', () => {
    const response = mapTechnicalInspectionCertificateResponse(null, null);

    expect(response).toEqual({
      issued: false,
      certificateNumber: null,
      issuedAt: null,
      inspectionDate: null,
      expiryDate: null,
      downloadAvailable: false,
    });
    expect(response).not.toHaveProperty('artifactFileKey');
    expect(response).not.toHaveProperty('issuedByUserId');
  });

  it('uses completedAt as Cambodia inspection date and validUntil as expiry', () => {
    const response = mapTechnicalInspectionCertificateResponse(
      {
        certificateNumber: '2299922916447',
        issuedAt: new Date('2026-09-12T05:30:00.000Z'),
      } as never,
      {
        completedAt: new Date('2026-09-09T18:00:00.000Z'),
        validUntil: '2030-09-10',
      },
    );

    expect(response).toEqual({
      issued: true,
      certificateNumber: '2299922916447',
      issuedAt: '2026-09-12T05:30:00.000Z',
      inspectionDate: '2026-09-10',
      expiryDate: '2030-09-10',
      downloadAvailable: true,
    });
    expect(response).not.toHaveProperty('artifactFileKey');
    expect(response).not.toHaveProperty('issuedByUserId');
  });
});
