import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { AdminApplicationsService } from './admin-applications.service';
import { ApplicationStatus } from './enums/application-status.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';

describe('AdminApplicationsService', () => {
  it('scopes the queue to submitted applications and applies filters, stable sorting, and pagination', async () => {
    const fixture = createFixture();
    const service = createService(fixture);

    const result = await service.list({
      page: 2,
      limit: 10,
      sortOrder: 'asc',
      sortBy: 'createdAt',
      status: ApplicationStatus.REJECTED,
      referenceNumber: 'VIR-2026',
      plateNumber: '2AB',
      citizenSearch: 'Citizen',
      submittedFrom: '2026-08-10',
      submittedTo: '2026-08-12',
    });

    expect(fixture.applicationQuery.where).toHaveBeenCalledWith(
      'application.submittedAt IS NOT NULL',
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.status = :status',
      { status: ApplicationStatus.REJECTED },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.referenceNumber ILIKE :referenceNumber',
      { referenceNumber: '%VIR-2026%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      "application.vehicleSnapshot ->> 'plateNumber' ILIKE :plateNumber",
      { plateNumber: '%2AB%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      "(application.applicantSnapshot ->> 'nameKh' ILIKE :citizenSearch OR application.applicantSnapshot ->> 'nameEn' ILIKE :citizenSearch OR application.applicantSnapshot ->> 'nationalIdNumber' ILIKE :citizenSearch)",
      { citizenSearch: '%Citizen%' },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.submittedAt >= :submittedFrom',
      { submittedFrom: new Date('2026-08-09T17:00:00.000Z') },
    );
    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.submittedAt < :submittedToExclusive',
      { submittedToExclusive: new Date('2026-08-12T17:00:00.000Z') },
    );
    expect(fixture.applicationQuery.orderBy).toHaveBeenCalledWith(
      'application.createdAt',
      'ASC',
    );
    expect(fixture.applicationQuery.addOrderBy).toHaveBeenCalledWith(
      'application.id',
      'ASC',
    );
    expect(fixture.applicationQuery.skip).toHaveBeenCalledWith(10);
    expect(fixture.applicationQuery.take).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({
      data: [
        expect.objectContaining({
          applicantNameEn: 'Test Citizen',
          plateNumber: '2AB-1234',
        }),
      ],
      meta: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('returns snapshots in admin detail and treats missing or never-submitted rows as not found', async () => {
    const fixture = createFixture();
    fixture.applicationQuery.getOne.mockResolvedValue(application());
    const service = createService(fixture);

    await expect(service.getDetail(APPLICATION_ID)).resolves.toMatchObject({
      applicantSnapshot: application().applicantSnapshot,
      vehicleSnapshot: application().vehicleSnapshot,
    });

    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.submittedAt IS NOT NULL',
    );
    fixture.applicationQuery.getOne.mockResolvedValue(null);
    await expect(service.getDetail(APPLICATION_ID)).rejects.toMatchObject({
      code: ApiErrorCode.APPLICATION_NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('checks admin submission scope before returning descending paginated history', async () => {
    const fixture = createFixture();
    fixture.applicationQuery.getOne.mockResolvedValue(application());
    const service = createService(fixture);

    const result = await service.listStatusHistory(APPLICATION_ID, {
      page: 2,
      limit: 5,
      sortOrder: 'desc',
    });

    expect(fixture.applicationQuery.andWhere).toHaveBeenCalledWith(
      'application.submittedAt IS NOT NULL',
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
    expect(fixture.historyQuery.skip).toHaveBeenCalledWith(5);
    expect(fixture.historyQuery.take).toHaveBeenCalledWith(5);
    expect(result.meta).toEqual({ page: 2, limit: 5, total: 0, totalPages: 0 });
  });
});

function createService(fixture: ReturnType<typeof createFixture>) {
  return new AdminApplicationsService(
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
  applicationQuery.getManyAndCount.mockResolvedValue([[application()], 1]);
  const historyQuery = query();
  historyQuery.getManyAndCount.mockResolvedValue([[], 0]);
  return { applicationQuery, historyQuery };
}

function query() {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  };
}

function application() {
  return {
    id: APPLICATION_ID,
    referenceNumber: 'VIR-20260810-ABCDEF123456',
    citizenId: 'citizen-id',
    vehicleId: 'vehicle-id',
    status: ApplicationStatus.SUBMITTED,
    currentCorrectionReason: null,
    currentRejectionReason: null,
    submittedAt: new Date('2026-08-10T00:00:00.000Z'),
    reviewStartedAt: null,
    readyForInspectionAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    applicantSnapshot: { nameEn: 'Test Citizen' },
    vehicleSnapshot: { plateNumber: '2AB-1234' },
  };
}
