import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { ApiErrorCode } from '../common/errors/api-error-code';
import { ApplicationStatus } from './enums/application-status.enum';
import { ApplicationsService } from './applications.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const APPLICATION_ID = '33333333-3333-4333-8333-333333333333';

describe('ApplicationsService', () => {
  it('scopes citizen application lists and orders by creation then ID descending', async () => {
    const fixture = createFixture();
    const service = createService(fixture);

    const result = await service.listCitizenApplications(CITIZEN_ID, {
      page: 2,
      limit: 10,
      sortOrder: 'desc',
    });

    expect(fixture.applicationQuery.where).toHaveBeenCalledWith(
      'application.citizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
    expect(fixture.applicationQuery.select).toHaveBeenCalledWith(
      expect.arrayContaining(['application.currentRejectionReason']),
    );
    expect(fixture.applicationQuery.orderBy).toHaveBeenCalledWith(
      'application.createdAt',
      'DESC',
    );
    expect(fixture.applicationQuery.addOrderBy).toHaveBeenCalledWith(
      'application.id',
      'DESC',
    );
    expect(fixture.applicationQuery.skip).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('returns detail only to the owning citizen', async () => {
    const fixture = createFixture();
    fixture.applicationQuery.getOne.mockResolvedValue(
      application(OTHER_CITIZEN_ID),
    );

    await expect(
      createService(fixture).getCitizenApplication(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
      status: HttpStatus.FORBIDDEN,
    });

    fixture.applicationQuery.getOne.mockResolvedValue(null);
    await expect(
      createService(fixture).getCitizenApplication(CITIZEN_ID, APPLICATION_ID),
    ).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('verifies ownership before returning paginated history in descending order', async () => {
    const fixture = createFixture();
    fixture.applicationQuery.getOne.mockResolvedValue(application(CITIZEN_ID));
    const service = createService(fixture);

    const result = await service.listCitizenStatusHistory(
      CITIZEN_ID,
      APPLICATION_ID,
      { page: 1, limit: 20, sortOrder: 'desc' },
    );

    expect(fixture.historyQuery.where).toHaveBeenCalledWith(
      'history.applicationId = :applicationId',
      { applicationId: APPLICATION_ID },
    );
    expect(fixture.historyQuery.orderBy).toHaveBeenCalledWith(
      'history.createdAt',
      'DESC',
    );
    expect(fixture.historyQuery.addOrderBy).toHaveBeenCalledWith(
      'history.id',
      'DESC',
    );
    expect(result.data).toEqual([]);
  });
});

function createService(fixture: ReturnType<typeof createFixture>) {
  return new ApplicationsService(
    {
      createQueryBuilder: jest.fn().mockReturnValue(fixture.applicationQuery),
    } as unknown as Repository<never>,
    {
      createQueryBuilder: jest.fn().mockReturnValue(fixture.historyQuery),
    } as unknown as Repository<never>,
  );
}

function createFixture() {
  const applicationQuery = query();
  applicationQuery.getManyAndCount.mockResolvedValue([
    [application(CITIZEN_ID)],
    1,
  ]);
  const historyQuery = query();
  historyQuery.getManyAndCount.mockResolvedValue([[], 0]);

  return { applicationQuery, historyQuery };
}

function query() {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  };
}

function application(citizenId: string) {
  return {
    id: APPLICATION_ID,
    referenceNumber: null,
    citizenId,
    vehicleId: 'vehicle-id',
    status: ApplicationStatus.DRAFT,
    currentCorrectionReason: null,
    currentRejectionReason: null,
    submittedAt: null,
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-08-07T00:00:00.000Z'),
    updatedAt: new Date('2026-08-07T00:00:00.000Z'),
  };
}
