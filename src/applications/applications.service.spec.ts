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
  it('applies citizen ownership, multi-status, and grouped search before pagination', async () => {
    const fixture = createFixture();
    const service = createService(fixture);

    const result = await service.listCitizenApplications(CITIZEN_ID, {
      page: 2,
      limit: 10,
      sortOrder: 'asc',
      search: 'ABC123',
      statuses: [ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW],
    });

    expect(fixture.applicationQuery.where).toHaveBeenCalledWith(
      'application.citizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
    expect(fixture.applicationQuery.select).toHaveBeenCalledWith(
      expect.arrayContaining([
        'application.currentRejectionReason',
        'application.preferredInspectionStationId',
        'application.preferredInspectionDate',
      ]),
    );
    expect(fixture.applicationQuery.orderBy).toHaveBeenCalledWith(
      'application.createdAt',
      'ASC',
    );
    expect(fixture.applicationQuery.addOrderBy).toHaveBeenCalledWith(
      'application.id',
      'ASC',
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.status IN (:...statuses)',
      {
        statuses: [ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW],
      },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        "application.vehicleSnapshot ->> 'plateNumber' ILIKE :search",
      ),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        "application.vehicleSnapshot ->> 'registrationNumber' ILIKE :search",
      ),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('application.vehicleSnapshot IS NULL'),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('vehicle.registrationNumber ILIKE :search'),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('vehicle.plateNumber ILIKE :search'),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        "application.vehicleSnapshot ->> 'make' ILIKE :search",
      ),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        "application.vehicleSnapshot ->> 'model' ILIKE :search",
      ),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        "application.vehicleSnapshot ->> 'manufactureYear' ILIKE :search",
      ),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('vehicle.make ILIKE :search'),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('vehicle.model ILIKE :search'),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        'CAST(vehicle.manufactureYear AS TEXT) ILIKE :search',
      ),
      { search: '%ABC123%' },
    );
    expect(fixture.applicationQuery.addSelect).toHaveBeenCalledWith(
      'application.vehicleSnapshot',
    );
    expect(fixture.applicationQuery.leftJoinAndSelect).toHaveBeenCalledWith(
      'application.vehicle',
      'vehicle',
    );
    expect(fixture.applicationQuery.leftJoinAndSelect).toHaveBeenCalledWith(
      'application.payment',
      'payment',
    );
    expect(fixture.applicationQuery.leftJoinAndMapOne).toHaveBeenCalledWith(
      'application.latestInspection',
      expect.anything(),
      'latestInspection',
      expect.stringContaining('latest_completed_inspection'),
      expect.objectContaining({ completedInspectionStatus: 'COMPLETED' }),
    );
    expect(fixture.applicationQuery.skip).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('searches the historical snapshot branch rather than live vehicle values for submitted applications', async () => {
    const fixture = createFixture();

    await createService(fixture).listCitizenApplications(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      search: 'Toyota 2024',
      statuses: [
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.APPROVED,
      ],
    });

    const searchCall = fixture.applicationQuery.andWhere.mock.calls.find(
      ([clause]) =>
        typeof clause === 'string' &&
        clause.includes('application.referenceNumber ILIKE :search'),
    ) as [unknown, ...unknown[]] | undefined;
    const searchClause = searchCall?.[0];
    expect(searchClause).toContain('application.vehicleSnapshot IS NOT NULL');
    expect(searchClause).toContain(
      "application.vehicleSnapshot ->> 'make' ILIKE :search",
    );
    expect(searchClause).toContain('application.vehicleSnapshot IS NULL AND (');
    expect(searchClause).toContain('vehicle.make ILIKE :search');
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.status IN (:...statuses)',
      {
        statuses: [
          ApplicationStatus.SUBMITTED,
          ApplicationStatus.UNDER_REVIEW,
          ApplicationStatus.APPROVED,
        ],
      },
    );
    expect(fixture.applicationQuery.skip).toHaveBeenCalledWith(0);
    expect(fixture.applicationQuery.take).toHaveBeenCalledWith(20);
  });

  it('keeps legacy status support and unions it with statuses without duplicates', async () => {
    const fixture = createFixture();

    await createService(fixture).listCitizenApplications(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      status: ApplicationStatus.SUBMITTED,
      statuses: [ApplicationStatus.SUBMITTED, ApplicationStatus.APPROVED],
    });

    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.status IN (:...statuses)',
      { statuses: [ApplicationStatus.SUBMITTED, ApplicationStatus.APPROVED] },
    );
  });

  it('accepts one status through statuses', async () => {
    const fixture = createFixture();

    await createService(fixture).listCitizenApplications(CITIZEN_ID, {
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      statuses: [ApplicationStatus.DRAFT],
    });

    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.status IN (:...statuses)',
      { statuses: [ApplicationStatus.DRAFT] },
    );
  });

  it('returns no matches with filtered pagination metadata', async () => {
    const fixture = createFixture();
    fixture.applicationQuery.getManyAndCount.mockResolvedValue([[], 0]);

    const result = await createService(fixture).listCitizenApplications(
      CITIZEN_ID,
      { page: 1, limit: 20, sortOrder: 'desc', search: 'no-match' },
    );

    expect(result).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(fixture.applicationQuery.where).toHaveBeenCalledWith(
      'application.citizenId = :citizenId',
      { citizenId: CITIZEN_ID },
    );
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
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndMapOne: jest.fn().mockReturnThis(),
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
    preferredInspectionStationId: null,
    preferredInspectionDate: null,
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
