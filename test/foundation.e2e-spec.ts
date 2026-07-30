import {
  Controller,
  Get,
  INestApplication,
  Module,
  Query,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApiApplication } from '../src/common/http/api-application.configuration';
import { createDataResponse } from '../src/common/http/api-response';
import { BasePaginationQueryDto } from '../src/common/pagination/base-pagination-query.dto';

@Controller('foundation-probe')
class FoundationProbeController {
  @Get()
  find(@Query() query: BasePaginationQueryDto) {
    return createDataResponse({
      page: query.page,
      limit: query.limit,
      sortOrder: query.sortOrder,
    });
  }
}

@Module({ controllers: [FoundationProbeController] })
class FoundationE2eModule {}

describe('common foundation (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FoundationE2eModule],
    }).compile();

    app = moduleFixture.createNestApplication<App>();
    configureApiApplication(app, '/api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('applies the API prefix and uses the approved validation error response', async () => {
    const success = await request(app.getHttpServer())
      .get('/api/v1/foundation-probe')
      .expect(200);
    const validationError = await request(app.getHttpServer())
      .get('/api/v1/foundation-probe?limit=101')
      .expect(400);
    const root = await request(app.getHttpServer()).get('/').expect(404);

    expect(success.body).toEqual({
      data: { page: 1, limit: 20, sortOrder: 'desc' },
    });
    expect(validationError.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: [expect.objectContaining({ field: 'limit', rule: 'max' })],
      path: '/api/v1/foundation-probe?limit=101',
    });
    expect(root.body).toMatchObject({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
  });
});
