import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { CitizenCertificatesController } from './citizen-certificates.controller';

describe('CitizenCertificatesController', () => {
  it('is CITIZEN-only and delegates status using the authenticated owner', async () => {
    const certificate = {
      issued: false,
      certificateNumber: null,
      issuedAt: null,
      inspectionDate: null,
      expiryDate: null,
      downloadAvailable: false,
    };
    const reads = {
      getCitizenCertificate: jest.fn().mockResolvedValue(certificate),
      downloadCitizenCertificate: jest.fn(),
    };
    const controller = new CitizenCertificatesController(reads as never);
    const actor = {
      userId: 'citizen-id',
      role: UserRole.CITIZEN,
      sessionId: 'session-id',
    };

    await expect(controller.status(actor, 'application-id')).resolves.toEqual({
      data: certificate,
    });
    expect(reads.getCitizenCertificate).toHaveBeenCalledWith(
      'citizen-id',
      'application-id',
    );
    expect(
      Reflect.getMetadata(ROLES_KEY, CitizenCertificatesController),
    ).toEqual([UserRole.CITIZEN]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CitizenCertificatesController),
    ).toEqual([AccessTokenGuard, RolesGuard]);
  });

  it('streams the owned private artifact with safe PDF headers', async () => {
    const document = {
      content: Buffer.from('%PDF-issued'),
      filename: 'technical-inspection-certificate-CERT_unsafe.pdf',
      mimeType: 'application/pdf',
    };
    const reads = {
      getCitizenCertificate: jest.fn(),
      downloadCitizenCertificate: jest.fn().mockResolvedValue(document),
    };
    const controller = new CitizenCertificatesController(reads as never);
    const actor = {
      userId: 'citizen-id',
      role: UserRole.CITIZEN,
      sessionId: 'session-id',
    };
    const response = { setHeader: jest.fn() };

    const streamed = await controller.download(
      actor,
      'application-id',
      response as never,
    );

    expect(reads.downloadCitizenCertificate).toHaveBeenCalledWith(
      'citizen-id',
      'application-id',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="technical-inspection-certificate-CERT_unsafe.pdf"',
    );
    expect(streamed).toBeDefined();
  });
});
