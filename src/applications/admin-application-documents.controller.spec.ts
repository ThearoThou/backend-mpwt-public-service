import {
  HttpStatus,
  ParseEnumPipe,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { AccessTokenGuard } from '../common/auth/access-token.guard';
import type { AuthenticatedRequest } from '../common/auth/authenticated-actor';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { RolesGuard } from '../common/auth/roles.guard';
import { DomainException } from '../common/errors/domain.exception';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminApplicationDocumentsController } from './admin-application-documents.controller';
import { DocumentType } from './enums/document-type.enum';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('AdminApplicationDocumentsController', () => {
  it('uses the existing ADMIN-only guard and role metadata', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminApplicationDocumentsController),
    ).toEqual([UserRole.ADMIN]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminApplicationDocumentsController),
    ).toEqual([AccessTokenGuard, RolesGuard]);
  });

  it('rejects a citizen through RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());
    const request: AuthenticatedRequest = {
      actor: {
        userId: 'citizen-id',
        role: UserRole.CITIZEN,
        sessionId: 'session-id',
      },
    } as AuthenticatedRequest;
    const context = {
      getHandler: () => function handler() {},
      getClass: () => AdminApplicationDocumentsController,
      switchToHttp: () => ({ getRequest: () => request }),
    };

    let thrown: unknown;
    try {
      guard.canActivate(context as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainException);
    expect((thrown as DomainException).status).toBe(HttpStatus.FORBIDDEN);
  });

  it('forwards list and history requests with standard response envelopes', async () => {
    const service = {
      listCurrent: jest.fn().mockResolvedValue([{ id: DOCUMENT_ID }]),
      listHistory: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      download: jest.fn(),
    };
    const controller = new AdminApplicationDocumentsController(
      service as never,
    );
    const query = { page: 1, limit: 20, sortOrder: 'desc' } as const;

    await expect(controller.listCurrent(APPLICATION_ID)).resolves.toEqual({
      data: [{ id: DOCUMENT_ID }],
    });
    await expect(
      controller.listHistory(
        APPLICATION_ID,
        DocumentType.CITIZEN_ID_CARD,
        query,
      ),
    ).resolves.toEqual({ data: [], meta: {} });
    expect(service.listCurrent).toHaveBeenCalledWith(APPLICATION_ID);
    expect(service.listHistory).toHaveBeenCalledWith(
      APPLICATION_ID,
      DocumentType.CITIZEN_ID_CARD,
      query,
    );
  });

  it('streams downloads with safe attachment headers', async () => {
    const content = Buffer.from('content');
    const service = {
      listCurrent: jest.fn(),
      listHistory: jest.fn(),
      download: jest.fn().mockResolvedValue({
        document: {
          mimeType: 'application/pdf',
          originalFileName: 'bad"\\\r\nname.pdf',
        },
        content,
      }),
    };
    const response = { setHeader: jest.fn() };
    const controller = new AdminApplicationDocumentsController(
      service as never,
    );

    const result = await controller.download(
      APPLICATION_ID,
      DOCUMENT_ID,
      response as never,
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="bad____name.pdf"',
    );
    expect(service.download).toHaveBeenCalledWith(APPLICATION_ID, DOCUMENT_ID);
  });

  it('uses Nest UUID and DocumentType pipes for invalid parameters', async () => {
    await expect(
      new ParseUUIDPipe({ version: '4' }).transform('not-a-uuid', {
        type: 'param',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(
      new ParseEnumPipe(DocumentType).transform('NOT_A_DOCUMENT', {
        type: 'param',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });
});
import 'reflect-metadata';
