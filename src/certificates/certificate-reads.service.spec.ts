import { HttpStatus } from '@nestjs/common';

import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionResult } from '../inspections/enums/inspection-result.enum';
import { InspectionStatus } from '../inspections/enums/inspection-status.enum';
import {
  CertificateReadsService,
  certificateDownloadFilename,
} from './certificate-reads.service';
import { TechnicalInspectionCertificate } from './entities/technical-inspection-certificate.entity';

describe('CertificateReadsService', () => {
  it('returns an owned issued certificate from immutable certificate and inspection facts', async () => {
    const fixture = createFixture();
    fixture.application.vehicle = { make: 'CHANGED LIVE VEHICLE' } as never;

    const response = await fixture.service.getCitizenCertificate(
      CITIZEN_ID,
      APPLICATION_ID,
    );

    expect(response).toEqual({
      issued: true,
      certificateNumber: 'MPWT/2026:001',
      issuedAt: '2026-09-09T10:00:00.000Z',
      inspectionDate: '2026-09-10',
      expiryDate: '2030-09-10',
      downloadAvailable: true,
    });
    expect(response).not.toHaveProperty('artifactFileKey');
    expect(response).not.toHaveProperty('issuedByUserId');
    expect(fixture.files.read).not.toHaveBeenCalled();
    expect(fixture.applications.save).not.toHaveBeenCalled();
    expect(fixture.certificates.save).not.toHaveBeenCalled();
    expect(fixture.inspections.save).not.toHaveBeenCalled();
  });

  it.each([
    ApplicationStatus.APPROVED,
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.CORRECTION_REQUIRED,
    ApplicationStatus.EXPIRED,
    ApplicationStatus.INSPECTION_FAILED,
    ApplicationStatus.CANCELLED,
    ApplicationStatus.COMPLETED,
  ])(
    'returns issued false for certificate-less status %s without writes',
    async (status) => {
      const fixture = createFixture();
      fixture.application.status = status;
      fixture.certificateValue = null;
      const completedAt = fixture.application.completedAt;

      await expect(
        fixture.service.getCitizenCertificate(CITIZEN_ID, APPLICATION_ID),
      ).resolves.toEqual({
        issued: false,
        certificateNumber: null,
        issuedAt: null,
        inspectionDate: null,
        expiryDate: null,
        downloadAvailable: false,
      });
      expect(fixture.application.status).toBe(status);
      expect(fixture.application.completedAt).toBe(completedAt);
      expect(fixture.applications.save).not.toHaveBeenCalled();
      expect(fixture.files.read).not.toHaveBeenCalled();
    },
  );

  it('rejects another citizen before reading certificate facts or files', async () => {
    const fixture = createFixture();

    await expectCode(
      fixture.service.getCitizenCertificate(OTHER_CITIZEN_ID, APPLICATION_ID),
      ApiErrorCode.RESOURCE_NOT_OWNED,
      HttpStatus.FORBIDDEN,
    );
    await expectCode(
      fixture.service.downloadCitizenCertificate(
        OTHER_CITIZEN_ID,
        APPLICATION_ID,
      ),
      ApiErrorCode.RESOURCE_NOT_OWNED,
      HttpStatus.FORBIDDEN,
    );
    expect(fixture.certificates.findOne).not.toHaveBeenCalled();
    expect(fixture.files.read).not.toHaveBeenCalled();
  });

  it('returns application-not-found without probing certificate data', async () => {
    const fixture = createFixture();
    fixture.applicationValue = null;

    await expectCode(
      fixture.service.getCitizenCertificate(CITIZEN_ID, APPLICATION_ID),
      ApiErrorCode.APPLICATION_NOT_FOUND,
      HttpStatus.NOT_FOUND,
    );
    expect(fixture.certificates.findOne).not.toHaveBeenCalled();
  });

  it('downloads the exact stored artifact without regenerating a PDF', async () => {
    const fixture = createFixture();

    const document = await fixture.service.downloadCitizenCertificate(
      CITIZEN_ID,
      APPLICATION_ID,
    );

    expect(fixture.files.read).toHaveBeenCalledWith(ARTIFACT_KEY);
    expect(document).toEqual({
      content: PDF,
      filename: 'technical-inspection-certificate-MPWT_2026_001.pdf',
      mimeType: 'application/pdf',
    });
    expect(document).not.toHaveProperty('artifactFileKey');
  });

  it('supports ADMIN status and download without applying citizen ownership', async () => {
    const fixture = createFixture();
    fixture.application.citizenId = OTHER_CITIZEN_ID;

    await expect(
      fixture.service.getAdminCertificate(APPLICATION_ID),
    ).resolves.toMatchObject({
      issued: true,
      certificateNumber: 'MPWT/2026:001',
    });
    await expect(
      fixture.service.downloadAdminCertificate(APPLICATION_ID),
    ).resolves.toMatchObject({ content: PDF, mimeType: 'application/pdf' });
  });

  it('rejects missing certificate and missing physical artifact safely', async () => {
    const missingCertificate = createFixture();
    missingCertificate.certificateValue = null;
    await expectCode(
      missingCertificate.service.downloadCitizenCertificate(
        CITIZEN_ID,
        APPLICATION_ID,
      ),
      ApiErrorCode.CERTIFICATE_NOT_AVAILABLE,
      HttpStatus.NOT_FOUND,
    );

    const missingFile = createFixture();
    missingFile.files.read.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );
    await expectCode(
      missingFile.service.downloadAdminCertificate(APPLICATION_ID),
      ApiErrorCode.CERTIFICATE_NOT_AVAILABLE,
      HttpStatus.NOT_FOUND,
    );
  });

  it('fails deterministically for certificate/application incoherence', async () => {
    const fixture = createFixture();
    fixture.certificate.applicationId = OTHER_APPLICATION_ID;

    await expectCode(
      fixture.service.getAdminCertificate(APPLICATION_ID),
      ApiErrorCode.CERTIFICATE_DATA_INCOHERENT,
      HttpStatus.CONFLICT,
    );
    expect(fixture.files.read).not.toHaveBeenCalled();
  });

  it('fails deterministically when the certificate points at another inspection', async () => {
    const fixture = createFixture();
    fixture.certificate.inspectionId = '00000000-0000-4000-8000-000000000099';

    await expectCode(
      fixture.service.downloadAdminCertificate(APPLICATION_ID),
      ApiErrorCode.CERTIFICATE_DATA_INCOHERENT,
      HttpStatus.CONFLICT,
    );
    expect(fixture.files.read).not.toHaveBeenCalled();
  });

  it.each([
    [
      'ownership',
      (inspection: Inspection) =>
        (inspection.applicationId = OTHER_APPLICATION_ID),
    ],
    ['attempt', (inspection: Inspection) => (inspection.attemptNumber = 2)],
    [
      'status',
      (inspection: Inspection) =>
        (inspection.status = InspectionStatus.PENDING),
    ],
    [
      'result',
      (inspection: Inspection) => (inspection.result = InspectionResult.FAIL),
    ],
    [
      'completedAt',
      (inspection: Inspection) => (inspection.completedAt = null),
    ],
    ['validUntil', (inspection: Inspection) => (inspection.validUntil = null)],
  ] as const)(
    'fails deterministically for inspection %s incoherence',
    async (_name, mutate) => {
      const fixture = createFixture();
      mutate(fixture.inspection);

      await expectCode(
        fixture.service.getAdminCertificate(APPLICATION_ID),
        ApiErrorCode.CERTIFICATE_DATA_INCOHERENT,
        HttpStatus.CONFLICT,
      );
    },
  );

  it('maps unexpected private-storage errors to a safe internal error', async () => {
    const fixture = createFixture();
    fixture.files.read.mockRejectedValue(new Error('C:\\private\\secret'));

    await expectCode(
      fixture.service.downloadAdminCertificate(APPLICATION_ID),
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});

describe('certificateDownloadFilename', () => {
  it.each([
    [
      'CERT/2026\\01:*?"<>|',
      'technical-inspection-certificate-CERT_2026_01.pdf',
    ],
    [
      'CERT\r\nInjected: header',
      'technical-inspection-certificate-CERT_Injected_header.pdf',
    ],
    ['../../..', 'technical-inspection-certificate.pdf'],
    ['វិញ្ញាបនបត្រ', 'technical-inspection-certificate.pdf'],
  ])(
    'sanitizes %p without traversal or header injection',
    (value, expected) => {
      const filename = certificateDownloadFilename(value);
      expect(filename).toBe(expected);
      expect(filename).not.toMatch(/[\\/\r\n:*?"<>|]/);
    },
  );
});

const APPLICATION_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_APPLICATION_ID = '00000000-0000-4000-8000-000000000002';
const CITIZEN_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_CITIZEN_ID = '00000000-0000-4000-8000-000000000004';
const INSPECTION_ID = '00000000-0000-4000-8000-000000000005';
const ARTIFACT_KEY = `certificate-artifacts/${APPLICATION_ID}/opaque.pdf`;
const PDF = Buffer.from('%PDF-issued');

function createFixture() {
  const application = {
    id: APPLICATION_ID,
    citizenId: CITIZEN_ID,
    status: ApplicationStatus.COMPLETED,
    completedAt: new Date('2026-09-09T10:00:00.000Z'),
  } as RenewalApplication;
  const certificate = {
    applicationId: APPLICATION_ID,
    inspectionId: INSPECTION_ID,
    certificateNumber: 'MPWT/2026:001',
    issuedAt: new Date('2026-09-09T10:00:00.000Z'),
    issuedByUserId: 'admin-id',
    artifactFileKey: ARTIFACT_KEY,
  } as TechnicalInspectionCertificate;
  const inspection = {
    id: INSPECTION_ID,
    applicationId: APPLICATION_ID,
    attemptNumber: 1,
    status: InspectionStatus.COMPLETED,
    result: InspectionResult.PASS,
    completedAt: new Date('2026-09-09T18:00:00.000Z'),
    validUntil: '2030-09-10',
  } as Inspection;
  const applications = repository();
  const certificates = repository();
  const inspections = repository();
  const files = {
    read: jest.fn().mockResolvedValue(PDF),
  };
  const fixture = {
    application,
    certificate,
    inspection,
    applicationValue: application as RenewalApplication | null,
    certificateValue: certificate as TechnicalInspectionCertificate | null,
    inspectionValue: inspection as Inspection | null,
    applications,
    certificates,
    inspections,
    files,
    service: null as unknown as CertificateReadsService,
  };
  applications.findOne.mockImplementation(() =>
    Promise.resolve(fixture.applicationValue),
  );
  certificates.findOne.mockImplementation(() =>
    Promise.resolve(fixture.certificateValue),
  );
  inspections.findOne.mockImplementation(() =>
    Promise.resolve(fixture.inspectionValue),
  );
  fixture.service = new CertificateReadsService(
    applications as never,
    certificates as never,
    inspections as never,
    files as never,
  );
  return fixture;
}

function repository() {
  return {
    findOne: jest.fn(),
    save: jest.fn(),
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
  status: HttpStatus,
): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(DomainException);
  expect((thrown as DomainException).code).toBe(code);
  expect((thrown as DomainException).getStatus()).toBe(status);
}
