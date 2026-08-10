import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ApplicationStatus } from '../enums/application-status.enum';
import { ListAdminApplicationsQueryDto } from './admin-application-request.dtos';

describe('ListAdminApplicationsQueryDto', () => {
  it('uses the approved pagination and submitted-date sorting defaults', () => {
    const input = new ListAdminApplicationsQueryDto();

    expect(input).toMatchObject({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      sortBy: 'submittedAt',
    });
  });

  it.each(['submittedAt', 'createdAt'])(
    'accepts %s as a sort field',
    async (sortBy) => {
      const input = plainToInstance(ListAdminApplicationsQueryDto, { sortBy });

      expect(await validate(input)).toHaveLength(0);
    },
  );

  it('rejects an invalid sort field and DRAFT status', async () => {
    const invalidSort = plainToInstance(ListAdminApplicationsQueryDto, {
      sortBy: 'referenceNumber',
    });
    const draft = plainToInstance(ListAdminApplicationsQueryDto, {
      status: ApplicationStatus.DRAFT,
    });

    expect(await validate(invalidSort)).not.toHaveLength(0);
    expect(await validate(draft)).not.toHaveLength(0);
  });

  it('accepts submitted admin statuses and trims search filters', async () => {
    const input = plainToInstance(ListAdminApplicationsQueryDto, {
      status: ApplicationStatus.REJECTED,
      referenceNumber: ' VIR-20260810 ',
      plateNumber: ' 2AB-1234 ',
      citizenSearch: ' Citizen Name ',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.referenceNumber).toBe('VIR-20260810');
    expect(input.plateNumber).toBe('2AB-1234');
    expect(input.citizenSearch).toBe('Citizen Name');
  });

  it('validates date-only filters and rejects an invalid submitted range', async () => {
    const valid = plainToInstance(ListAdminApplicationsQueryDto, {
      submittedFrom: '2026-08-01',
      submittedTo: '2026-08-31',
    });
    const invalidDate = plainToInstance(ListAdminApplicationsQueryDto, {
      submittedFrom: '2026-02-30',
    });
    const invalidRange = plainToInstance(ListAdminApplicationsQueryDto, {
      submittedFrom: '2026-08-31',
      submittedTo: '2026-08-01',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalidDate)).not.toHaveLength(0);
    expect(await validate(invalidRange)).not.toHaveLength(0);
  });
});
