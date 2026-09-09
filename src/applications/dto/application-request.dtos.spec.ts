import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CancelRenewalApplicationRequestDto,
  CreateRenewalApplicationDraftRequestDto,
  ListCitizenApplicationsQueryDto,
} from './application-request.dtos';
import { ApplicationStatus } from '../enums/application-status.enum';

describe('CreateRenewalApplicationDraftRequestDto', () => {
  it('accepts a UUID vehicle ID', async () => {
    const input = plainToInstance(CreateRenewalApplicationDraftRequestDto, {
      vehicleId: '11111111-1111-4111-8111-111111111111',
    });

    expect(await validate(input)).toHaveLength(0);
  });

  it.each([
    ['an invalid UUID', 'invalid'],
    ['a missing vehicle ID', undefined],
  ])('rejects %s', async (_scenario, vehicleId) => {
    const input = plainToInstance(CreateRenewalApplicationDraftRequestDto, {
      vehicleId,
    });

    expect(await validate(input)).not.toHaveLength(0);
  });

  it('rejects unknown request fields with the configured whitelist behavior', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          vehicleId: '11111111-1111-4111-8111-111111111111',
          citizenId: '22222222-2222-4222-822222222222',
        },
        { type: 'body', metatype: CreateRenewalApplicationDraftRequestDto },
      ),
    ).rejects.toBeDefined();
  });
});

describe('CancelRenewalApplicationRequestDto', () => {
  it('accepts a normal reason string', async () => {
    const input = plainToInstance(CancelRenewalApplicationRequestDto, {
      reason: 'No longer required',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.reason).toBe('No longer required');
  });

  it('accepts omission and normalizes reason values', async () => {
    const omitted = plainToInstance(CancelRenewalApplicationRequestDto, {});
    const trimmed = plainToInstance(CancelRenewalApplicationRequestDto, {
      reason: ' reason ',
    });
    const blank = plainToInstance(CancelRenewalApplicationRequestDto, {
      reason: '   ',
    });
    expect(await validate(omitted)).toHaveLength(0);
    expect(await validate(trimmed)).toHaveLength(0);
    expect(trimmed.reason).toBe('reason');
    expect(blank.reason).toBeNull();
  });
  it('rejects non-string and overlong reasons', async () => {
    expect(
      await validate(
        plainToInstance(CancelRenewalApplicationRequestDto, { reason: 1 }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CancelRenewalApplicationRequestDto, {
          reason: 'x'.repeat(501),
        }),
      ),
    ).not.toHaveLength(0);
  });
  it('accepts exactly 500 characters after trimming', async () => {
    const input = plainToInstance(CancelRenewalApplicationRequestDto, {
      reason: ` ${'x'.repeat(500)} `,
    });
    expect(await validate(input)).toHaveLength(0);
    expect(input.reason).toHaveLength(500);
  });
});

describe('ListCitizenApplicationsQueryDto', () => {
  it('trims search and accepts single and comma-separated application-status filters', async () => {
    const input = plainToInstance(ListCitizenApplicationsQueryDto, {
      search: '  ABC123  ',
      status: ApplicationStatus.COMPLETED,
      statuses: ' SUBMITTED, UNDER_REVIEW, SUBMITTED ',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.search).toBe('ABC123');
    expect(input.status).toBe(ApplicationStatus.COMPLETED);
    expect(input.statuses).toEqual([
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
    ]);
  });

  it('treats blank search as absent and rejects an invalid status', async () => {
    const blank = plainToInstance(ListCitizenApplicationsQueryDto, {
      search: '   ',
    });
    const invalidStatus = plainToInstance(ListCitizenApplicationsQueryDto, {
      status: 'NOT_A_STATUS',
    });
    const invalidStatuses = plainToInstance(ListCitizenApplicationsQueryDto, {
      statuses: 'SUBMITTED,NOT_A_STATUS',
    });

    expect(await validate(blank)).toHaveLength(0);
    expect(blank.search).toBeUndefined();
    expect(await validate(invalidStatus)).not.toHaveLength(0);
    expect(await validate(invalidStatuses)).not.toHaveLength(0);
  });

  it('treats blank statuses as absent', async () => {
    const input = plainToInstance(ListCitizenApplicationsQueryDto, {
      statuses: ' , ',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.statuses).toBeUndefined();
  });
});
