import 'reflect-metadata';

import { HttpStatus, INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AuthTokenService } from '../src/auth/auth-token.service';
import { RefreshSessionService } from '../src/auth/refresh-session.service';
import { AdminVehiclesController } from '../src/vehicles/admin-vehicles.controller';
import { AccessTokenGuard } from '../src/common/auth/access-token.guard';
import { RolesGuard } from '../src/common/auth/roles.guard';
import { configureApiApplication } from '../src/common/http/api-application.configuration';
import { ApiErrorCode } from '../src/common/errors/api-error-code';
import { DomainException } from '../src/common/errors/domain.exception';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/users/enums/user-role.enum';
import { UserStatus } from '../src/users/enums/user-status.enum';
import { VehiclesController } from '../src/vehicles/vehicles.controller';
import { VehiclesService } from '../src/vehicles/vehicles.service';

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';

@Module({
  controllers: [VehiclesController, AdminVehiclesController],
  providers: [
    VehiclesService,
    AccessTokenGuard,
    RolesGuard,
    AuthTokenService,
    RefreshSessionService,
    { provide: getRepositoryToken(User), useValue: {} },
  ],
})
class VehiclesControllerE2eModule {}

describe('vehicles controllers (e2e)', () => {
  let app: INestApplication<App>;
  let vehiclesService: jest.Mocked<
    Pick<
      VehiclesService,
      | 'createCitizenVehicle'
      | 'listCitizenVehicles'
      | 'getCitizenVehicle'
      | 'listAdminVehicles'
      | 'getAdminVehicle'
    >
  >;

  beforeEach(async () => {
    vehiclesService = {
      createCitizenVehicle: jest.fn().mockResolvedValue(vehicle()),
      listCitizenVehicles: jest.fn().mockResolvedValue(page()),
      getCitizenVehicle: jest.fn().mockResolvedValue(vehicle()),
      listAdminVehicles: jest.fn().mockResolvedValue(page()),
      getAdminVehicle: jest.fn().mockResolvedValue(vehicle()),
    };
    const tokenService = {
      verifyAccessToken: jest.fn((token: string) => {
        if (token === 'citizen-token') {
          return claims(
            CITIZEN_ID,
            UserRole.CITIZEN,
            '44444444-4444-4444-8444-444444444444',
          );
        }
        if (token === 'admin-token') {
          return claims(
            ADMIN_ID,
            UserRole.ADMIN,
            '55555555-5555-4555-8555-555555555555',
          );
        }
        throw new DomainException(
          ApiErrorCode.AUTH_TOKEN_INVALID,
          HttpStatus.UNAUTHORIZED,
          'Authentication is required',
        );
      }),
    };
    const sessionService = {
      validateActiveSessionForUser: jest.fn((sessionId: string) => ({
        id: sessionId,
      })),
    };
    const usersRepository = {
      findOne: jest.fn(({ where }: { where: { id: string } }) => ({
        id: where.id,
        role: where.id === ADMIN_ID ? UserRole.ADMIN : UserRole.CITIZEN,
        status: UserStatus.ACTIVE,
      })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [VehiclesControllerE2eModule],
    })
      .overrideProvider(VehiclesService)
      .useValue(vehiclesService)
      .overrideProvider(AuthTokenService)
      .useValue(tokenService)
      .overrideProvider(RefreshSessionService)
      .useValue(sessionService)
      .overrideProvider(getRepositoryToken(User))
      .useValue(usersRepository)
      .compile();

    app = moduleFixture.createNestApplication<App>();
    configureApiApplication(app, '/api');
    await app.init();
  });

  afterEach(async () => app?.close());

  it('implements the citizen list and create envelopes with scoped defaults and safe fields', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.OK);
    const created = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send(createInput())
      .expect(HttpStatus.CREATED);

    expect(vehiclesService.listCitizenVehicles).toHaveBeenCalledWith(
      CITIZEN_ID,
      expect.objectContaining({
        page: 1,
        limit: 20,
        sortOrder: 'desc',
        sortBy: 'createdAt',
      }),
    );
    expect(vehiclesService.createCitizenVehicle).toHaveBeenCalledWith(
      CITIZEN_ID,
      expect.objectContaining({
        registrationNumber: 'AB-1234',
        registeredOwnerPhone: '+85512345678',
      }),
    );
    expect(list.body).toMatchObject({
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(created.body).toMatchObject({
      data: { id: VEHICLE_ID, linkedCitizenId: CITIZEN_ID },
    });
    expect(created.body).not.toHaveProperty('data.linkedCitizen');
    expect(created.body).not.toHaveProperty('data.renewalApplications');
  });

  it('validates citizen create inputs and rejects server-controlled fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({ ...createInput(), linkedCitizenId: ADMIN_ID })
      .expect(HttpStatus.BAD_REQUEST);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
    expect(vehiclesService.createCitizenVehicle).not.toHaveBeenCalled();
  });

  it('rejects former synthetic validation field names as unknown input', async () => {
    const body = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({ ...createInput(), plateValidation: true })
      .expect(HttpStatus.BAD_REQUEST);
    const query = await request(app.getHttpServer())
      .get('/api/admin/vehicles?createdRangeValidation=true')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.BAD_REQUEST);

    expect(body.body).toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
    expect(query.body).toMatchObject({ code: ApiErrorCode.VALIDATION_ERROR });
  });

  it('validates strict calendar dates and actual integer manufacture years', async () => {
    const timestamp = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({ ...createInput(), firstRegistrationDate: '2026-08-04T00:00:00Z' })
      .expect(HttpStatus.BAD_REQUEST);
    const impossibleDate = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({ ...createInput(), inspectionExpiryDate: '2026-02-30' })
      .expect(HttpStatus.BAD_REQUEST);

    for (const manufactureYear of ['2020', true, 2020.5]) {
      const response = await request(app.getHttpServer())
        .post('/api/vehicles')
        .set('Authorization', 'Bearer citizen-token')
        .send({ ...createInput(), manufactureYear })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toMatchObject({
        code: ApiErrorCode.VALIDATION_ERROR,
      });
    }

    await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({ ...createInput(), manufactureYear: 2020 })
      .expect(HttpStatus.CREATED);

    expect(timestamp.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
    expect(impossibleDate.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
  });

  it('accepts and normalizes approved province and personalized civilian plates', async () => {
    const province = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({
        ...createInput(),
        plateProvince: ' សៀមរាប ',
        plateNumber: ' 2ab-3146 ',
      })
      .expect(HttpStatus.CREATED);
    vehiclesService.createCitizenVehicle.mockResolvedValueOnce({
      ...vehicle(),
      plateCategory: 'PERSONALIZED_CAMBODIA',
      plateProvince: null,
      plateDisplayLabelKh: 'កម្ពុជា',
      plateNumber: 'TQ.AA.A1',
    });
    const personalized = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({
        ...createInput(),
        plateCategory: 'PERSONALIZED_CAMBODIA',
        plateProvince: null,
        plateNumber: ' tq.aa.a1 ',
      })
      .expect(HttpStatus.CREATED);

    expect(vehiclesService.createCitizenVehicle).toHaveBeenCalledWith(
      CITIZEN_ID,
      expect.objectContaining({
        plateCategory: 'PROVINCE',
        plateProvince: 'សៀមរាប',
        plateNumber: '2AB-3146',
      }),
    );
    expect(province.body).toMatchObject({
      data: {
        plateCategory: 'PROVINCE',
        plateProvince: 'ភ្នំពេញ',
        plateDisplayLabelKh: 'ភ្នំពេញ',
        plateNumber: '2AB-3146',
      },
    });
    expect(personalized.body).toMatchObject({
      data: {
        plateCategory: 'PERSONALIZED_CAMBODIA',
        plateProvince: null,
        plateDisplayLabelKh: 'កម្ពុជា',
        plateNumber: 'TQ.AA.A1',
      },
    });
  });

  it.each([
    { plateProvince: 'Phnom Penh' },
    { plateProvince: 'កម្ពុជា' },
    { plateProvince: '' },
    { plateProvince: undefined },
    { plateNumber: '2AB3146' },
    { plateNumber: '2AB 3146' },
    {
      plateCategory: 'PERSONALIZED_CAMBODIA',
      plateProvince: 'ភ្នំពេញ',
      plateNumber: 'SEHORNG',
    },
    {
      plateCategory: 'PERSONALIZED_CAMBODIA',
      plateProvince: null,
      plateNumber: 'SOK-DARA',
    },
    {
      plateCategory: 'PERSONALIZED_CAMBODIA',
      plateProvince: null,
      plateNumber: '.........',
    },
  ])('rejects an invalid category-aware plate request', async (overrides) => {
    const response = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({ ...createInput(), ...overrides })
      .expect(HttpStatus.BAD_REQUEST);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
  });

  it.each([
    [ApiErrorCode.VEHICLE_REGISTRATION_CONFLICT, 'registration'],
    [ApiErrorCode.VEHICLE_CHASSIS_CONFLICT, 'chassis'],
    [ApiErrorCode.VEHICLE_PLATE_CONFLICT, 'plate'],
  ])('returns %s for a vehicle %s conflict', async (code) => {
    vehiclesService.createCitizenVehicle.mockRejectedValueOnce(
      new DomainException(
        code,
        HttpStatus.CONFLICT,
        'Vehicle conflicts with an existing record',
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send(createInput())
      .expect(HttpStatus.CONFLICT);

    expect(response.body).toMatchObject({
      code,
      statusCode: HttpStatus.CONFLICT,
    });
  });

  it.each([
    ['the same plate type', 'Private'],
    ['a different plate type', 'Commercial'],
  ])(
    'returns a plate conflict for the same province and plate number with %s',
    async (_scenario, plateType) => {
      vehiclesService.createCitizenVehicle.mockRejectedValueOnce(
        new DomainException(
          ApiErrorCode.VEHICLE_PLATE_CONFLICT,
          HttpStatus.CONFLICT,
          'Vehicle conflicts with an existing record',
        ),
      );

      const response = await request(app.getHttpServer())
        .post('/api/vehicles')
        .set('Authorization', 'Bearer citizen-token')
        .send({ ...createInput(), plateType })
        .expect(HttpStatus.CONFLICT);

      expect(response.body).toMatchObject({
        code: ApiErrorCode.VEHICLE_PLATE_CONFLICT,
      });
      expect(vehiclesService.createCitizenVehicle).toHaveBeenCalledWith(
        CITIZEN_ID,
        expect.objectContaining({
          plateCategory: 'PROVINCE',
          plateProvince: 'ភ្នំពេញ',
          plateNumber: '2AB-3146',
          plateType,
        }),
      );
    },
  );

  it('accepts the same province-format plate number in another province', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send(createInput())
      .expect(HttpStatus.CREATED);
    const second = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .send({
        ...createInput(),
        registrationNumber: 'CD-5678',
        chassisNumber: 'CH-456',
        plateProvince: 'សៀមរាប',
      })
      .expect(HttpStatus.CREATED);

    expect(first.body).toHaveProperty('data.id', VEHICLE_ID);
    expect(second.body).toHaveProperty('data.id', VEHICLE_ID);
    expect(vehiclesService.createCitizenVehicle).toHaveBeenNthCalledWith(
      2,
      CITIZEN_ID,
      expect.objectContaining({
        plateCategory: 'PROVINCE',
        plateProvince: 'សៀមរាប',
        plateNumber: '2AB-3146',
      }),
    );
  });

  it('returns citizen detail and approved ownership/not-found errors', async () => {
    await request(app.getHttpServer())
      .get(`/api/vehicles/${VEHICLE_ID}`)
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.OK);
    vehiclesService.getCitizenVehicle.mockRejectedValueOnce(
      new DomainException(
        ApiErrorCode.RESOURCE_NOT_OWNED,
        HttpStatus.FORBIDDEN,
        'Vehicle is outside the citizen ownership scope',
      ),
    );
    const unowned = await request(app.getHttpServer())
      .get(`/api/vehicles/${VEHICLE_ID}`)
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.FORBIDDEN);
    vehiclesService.getCitizenVehicle.mockRejectedValueOnce(
      new DomainException(
        ApiErrorCode.VEHICLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Vehicle not found',
      ),
    );
    const absent = await request(app.getHttpServer())
      .get(`/api/vehicles/${VEHICLE_ID}`)
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.NOT_FOUND);

    expect(unowned.body).toMatchObject({
      code: ApiErrorCode.RESOURCE_NOT_OWNED,
    });
    expect(absent.body).toMatchObject({ code: ApiErrorCode.VEHICLE_NOT_FOUND });
  });

  it('implements admin list filters and detail without nested citizen data', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/admin/vehicles')
      .set('Authorization', 'Bearer admin-token')
      .query({
        registrationNumber: ' ab-1234 ',
        chassisNumber: ' ch  123 ',
        plateNumber: ' 2ab-3146 ',
        linkedCitizenId: CITIZEN_ID,
        createdFrom: '2030-01-01',
        createdTo: '2030-12-31',
        sortBy: 'plateNumber',
        sortOrder: 'asc',
      })
      .expect(HttpStatus.OK);
    const detail = await request(app.getHttpServer())
      .get(`/api/admin/vehicles/${VEHICLE_ID}`)
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.OK);

    expect(vehiclesService.listAdminVehicles).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationNumber: 'AB-1234',
        chassisNumber: 'CH 123',
        plateNumber: '2AB-3146',
        sortBy: 'plateNumber',
        sortOrder: 'asc',
      }),
    );
    expect(list.body).toHaveProperty('meta');
    expect(detail.body).not.toHaveProperty('data.linkedCitizen');
  });

  it('enforces role, UUID, query, and date-range validation', async () => {
    const missingToken = await request(app.getHttpServer())
      .get('/api/vehicles')
      .expect(HttpStatus.UNAUTHORIZED);
    const invalidToken = await request(app.getHttpServer())
      .get('/api/admin/vehicles')
      .set('Authorization', 'Bearer invalid-token')
      .expect(HttpStatus.UNAUTHORIZED);
    const citizenAdmin = await request(app.getHttpServer())
      .get('/api/admin/vehicles')
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.FORBIDDEN);
    const adminCitizen = await request(app.getHttpServer())
      .get('/api/vehicles')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.FORBIDDEN);
    const invalidUuid = await request(app.getHttpServer())
      .get('/api/admin/vehicles/not-a-uuid')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.BAD_REQUEST);
    const invalidQuery = await request(app.getHttpServer())
      .get('/api/admin/vehicles?sortBy=isActive')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.BAD_REQUEST);
    const maximumLimit = await request(app.getHttpServer())
      .get('/api/vehicles?limit=101')
      .set('Authorization', 'Bearer citizen-token')
      .expect(HttpStatus.BAD_REQUEST);
    const badRange = await request(app.getHttpServer())
      .get('/api/admin/vehicles?createdFrom=2031-01-02&createdTo=2031-01-01')
      .set('Authorization', 'Bearer admin-token')
      .expect(HttpStatus.BAD_REQUEST);

    expect(missingToken.body).toMatchObject({
      code: ApiErrorCode.AUTH_TOKEN_INVALID,
    });
    expect(invalidToken.body).toMatchObject({
      code: ApiErrorCode.AUTH_TOKEN_INVALID,
    });
    expect(citizenAdmin.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
    expect(adminCitizen.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
    expect(invalidUuid.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
    expect(invalidQuery.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
    expect(maximumLimit.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
    expect(badRange.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
    });
  });
});

function claims(
  userId: string,
  role: UserRole.CITIZEN | UserRole.ADMIN,
  sessionId: string,
) {
  return { sub: userId, role, sid: sessionId, typ: 'access' as const };
}

function page() {
  return {
    data: [vehicle()],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  };
}

function vehicle() {
  return {
    id: VEHICLE_ID,
    linkedCitizenId: CITIZEN_ID,
    registrationNumber: 'AB-1234',
    plateNumber: '2AB-3146',
    plateCategory: 'PROVINCE',
    plateProvince: 'ភ្នំពេញ',
    plateDisplayLabelKh: 'ភ្នំពេញ',
    plateType: 'Private',
    vehicleType: 'Car',
    make: 'Toyota',
    model: 'Camry',
    manufactureYear: 2020,
    chassisNumber: 'CH-123',
    firstRegistrationDate: '2020-01-01',
    lastInspectionDate: null,
    inspectionExpiryDate: '2030-01-01',
    registeredOwnerNameKh: 'អ្នកបើកបរ',
    registeredOwnerNameEn: 'Citizen Owner',
    registeredOwnerPhone: '+85512345678',
    isActive: true,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
  };
}

function createInput() {
  return {
    registrationNumber: ' ab-1234 ',
    plateNumber: ' 2ab-3146 ',
    plateCategory: 'PROVINCE',
    plateProvince: ' ភ្នំពេញ ',
    plateType: ' Private ',
    vehicleType: ' Car ',
    make: ' Toyota ',
    model: ' Camry ',
    chassisNumber: ' ch  123 ',
    firstRegistrationDate: '2020-01-01',
    inspectionExpiryDate: '2030-01-01',
    registeredOwnerNameKh: 'អ្នកបើកបរ',
    registeredOwnerNameEn: 'Citizen Owner',
    registeredOwnerPhone: '012 345 678',
  };
}
