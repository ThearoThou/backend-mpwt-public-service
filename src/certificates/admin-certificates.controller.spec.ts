import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminCertificatesController } from './admin-certificates.controller';

describe('AdminCertificatesController', () => {
  it('is ADMIN-only and delegates the official entered number and actor', async () => {
    const response = {
      issued: true,
      certificateNumber: 'MPWT-001',
      issuedAt: '2026-09-09T10:00:00.000Z',
      inspectionDate: '2026-09-09',
      expiryDate: '2030-09-09',
      downloadAvailable: true,
    };
    const issuance = { issue: jest.fn().mockResolvedValue(response) };
    const reads = {
      getAdminCertificate: jest.fn().mockResolvedValue(response),
      downloadAdminCertificate: jest.fn(),
    };
    const controller = new AdminCertificatesController(
      issuance as never,
      reads as never,
    );
    const actor = {
      userId: 'admin-id',
      role: UserRole.ADMIN,
      sessionId: 'session-id',
    };
    const input = { certificateNumber: 'MPWT-001' };

    await expect(
      controller.issue('application-id', actor, input),
    ).resolves.toEqual({ data: response });
    expect(issuance.issue).toHaveBeenCalledWith(
      'application-id',
      'admin-id',
      input,
    );
    expect(Reflect.getMetadata(ROLES_KEY, AdminCertificatesController)).toEqual(
      [UserRole.ADMIN],
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminCertificatesController),
    ).toEqual([AccessTokenGuard, RolesGuard]);
  });

  it('returns safe certificate status and streams a protected PDF', async () => {
    const certificate = {
      issued: true,
      certificateNumber: 'MPWT-001',
      issuedAt: '2026-09-09T10:00:00.000Z',
      inspectionDate: '2026-09-09',
      expiryDate: '2030-09-09',
      downloadAvailable: true,
    };
    const document = {
      content: Buffer.from('%PDF-issued'),
      filename: 'technical-inspection-certificate-MPWT-001.pdf',
      mimeType: 'application/pdf',
    };
    const reads = {
      getAdminCertificate: jest.fn().mockResolvedValue(certificate),
      downloadAdminCertificate: jest.fn().mockResolvedValue(document),
    };
    const controller = new AdminCertificatesController(
      {} as never,
      reads as never,
    );
    const response = { setHeader: jest.fn() };

    await expect(controller.status('application-id')).resolves.toEqual({
      data: certificate,
    });
    const streamed = await controller.download(
      'application-id',
      response as never,
    );

    expect(reads.getAdminCertificate).toHaveBeenCalledWith('application-id');
    expect(reads.downloadAdminCertificate).toHaveBeenCalledWith(
      'application-id',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="technical-inspection-certificate-MPWT-001.pdf"',
    );
    expect(streamed).toBeDefined();
  });
});
