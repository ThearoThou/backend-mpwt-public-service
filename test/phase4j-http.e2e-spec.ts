import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { RefreshSession } from '../src/auth/entities/refresh-session.entity';
import { configureApiApplication } from '../src/common/http/api-application.configuration';
import { InspectionStationDailyCapacity } from '../src/scheduling/entities/inspection-station-daily-capacity.entity';
import { InspectionStation } from '../src/scheduling/entities/inspection-station.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';

interface CitizenStationResponse {
  id: string;
  code: string;
  nameKh: string;
  nameEn: string;
  province: string;
  address: string;
  phone: string | null;
}

interface DailyCapacityResponse {
  id: string;
  stationId: string;
  dailyCapacity: number;
  reservedCount: number;
  isClosed: boolean;
}

function responseData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('data' in value)) {
    throw new Error('Expected an API data response');
  }
  return value.data;
}

function stations(value: unknown): CitizenStationResponse[] {
  const data = responseData(value);
  if (!Array.isArray(data)) throw new Error('Expected station array data');
  return data as CitizenStationResponse[];
}

function dailyCapacity(value: unknown): DailyCapacityResponse {
  const data = responseData(value);
  if (typeof data !== 'object' || data === null) {
    throw new Error('Expected daily capacity data');
  }
  return data as DailyCapacityResponse;
}

describe('Phase 4J scheduling HTTP', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let httpServer: Parameters<typeof request>[0];
  let citizenToken: string;
  let adminToken: string;
  const ids = {
    citizen: randomUUID(),
    admin: randomUUID(),
    active: randomUUID(),
    inactive: randomUUID(),
  };
  const suffix = randomUUID().slice(0, 12);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApiApplication(
      app,
      app.get(ConfigService).getOrThrow('API_PREFIX'),
    );
    await app.init();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    dataSource = app.get(DataSource);
    const tokens = app.get(AuthTokenService);
    for (const [id, role] of [
      [ids.citizen, UserRole.CITIZEN],
      [ids.admin, UserRole.ADMIN],
    ] as const) {
      const sessionId = randomUUID();
      await dataSource.getRepository(User).save({
        id,
        role,
        status: UserStatus.ACTIVE,
        phone: null,
        email: `p4j-${id}@example.test`,
        passwordHash: 'test',
        phoneVerifiedAt: null,
        emailVerifiedAt: new Date(),
        lastLoginAt: null,
      });
      await dataSource.getRepository(RefreshSession).save({
        id: sessionId,
        userId: id,
        tokenHash: 'test',
        expiresAt: new Date(Date.now() + 3600000),
        lastUsedAt: null,
        revokedAt: null,
        revocationReason: null,
        reuseDetectedAt: null,
      });
      const signed = await tokens.signAccessToken({
        userId: id,
        role,
        sessionId,
        expiresAt: new Date(Date.now() + 3600000),
      });
      if (role === UserRole.CITIZEN) citizenToken = signed.token;
      else adminToken = signed.token;
    }
    await dataSource.getRepository(InspectionStation).save([
      {
        id: ids.active,
        code: `P4J-A-${suffix}`,
        nameKh: 'Active',
        nameEn: 'Active',
        province: 'PP',
        address: 'A',
        phone: null,
        isActive: true,
      },
      {
        id: ids.inactive,
        code: `P4J-I-${suffix}`,
        nameKh: 'Inactive',
        nameEn: 'Inactive',
        province: 'PP',
        address: 'I',
        phone: null,
        isActive: false,
      },
    ]);
  });
  afterAll(async () => {
    await dataSource
      .getRepository(InspectionStationDailyCapacity)
      .delete({ stationId: ids.active });
    await dataSource
      .getRepository(InspectionStation)
      .delete([ids.active, ids.inactive]);
    await dataSource
      .getRepository(RefreshSession)
      .delete({ userId: ids.citizen });
    await dataSource
      .getRepository(RefreshSession)
      .delete({ userId: ids.admin });
    await dataSource.getRepository(User).delete([ids.citizen, ids.admin]);
    await app.close();
  });
  it('enforces roles and returns citizen-safe active stations', async () => {
    await request(httpServer).get('/api/stations').expect(401);
    await request(httpServer)
      .get('/api/stations')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    const response = await request(httpServer)
      .get('/api/stations')
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(200);
    const data = stations(response.body as unknown);
    expect(data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.active })]),
    );
    expect(data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.inactive })]),
    );
    expect(data[0]).not.toHaveProperty('reservedCount');
  });
  it('validates and persists admin daily capacity through HTTP', async () => {
    const body = {
      stationId: ids.active,
      capacityDate: '2026-12-20',
      dailyCapacity: 2,
    };
    await request(httpServer)
      .post('/api/admin/scheduling/daily-capacities')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send(body)
      .expect(403);
    await request(httpServer)
      .post('/api/admin/scheduling/daily-capacities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...body, capacityDate: '2026-12-20T10:30:00Z' })
      .expect(400);
    const response = await request(httpServer)
      .post('/api/admin/scheduling/daily-capacities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(201);
    const created = dailyCapacity(response.body as unknown);
    expect(created).toMatchObject({
      stationId: ids.active,
      dailyCapacity: 2,
      reservedCount: 0,
      isClosed: false,
    });
    await expect(
      dataSource
        .getRepository(InspectionStationDailyCapacity)
        .findOneByOrFail({ id: created.id }),
    ).resolves.toMatchObject({ reservedCount: 0, isClosed: false });
  });
});
