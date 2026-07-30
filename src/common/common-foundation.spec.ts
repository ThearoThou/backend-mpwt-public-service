import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { ApiExceptionFilter } from './errors/api-exception.filter';
import { API_ERROR_CODES, ApiErrorCode } from './errors/api-error-code';
import { DomainException } from './errors/domain.exception';
import { formatValidationErrors } from './errors/validation-error.formatter';
import {
  createDataResponse,
  createPaginatedResponse,
} from './http/api-response';
import { normalizeApiPrefix } from './http/api-prefix';
import { BasePaginationQueryDto } from './pagination/base-pagination-query.dto';
import { createPaginationMeta } from './pagination/pagination-meta';
import { getRequestContext } from './request-context/request-context';

describe('common foundation', () => {
  it('contains exactly 55 unique approved API error codes', () => {
    expect(API_ERROR_CODES).toHaveLength(55);
    expect(new Set(API_ERROR_CODES).size).toBe(55);
  });

  it('keeps DomainException fields explicit and safe', () => {
    const details = [
      { field: 'limit', message: 'must not exceed 100', rule: 'max' },
    ];
    const exception = new DomainException(
      ApiErrorCode.VALIDATION_ERROR,
      HttpStatus.BAD_REQUEST,
      'Request validation failed',
      details,
    );

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(exception.safeMessage).toBe('Request validation failed');
    expect(exception.details).toEqual(details);
  });

  it('formats nested validation errors without values or targets', () => {
    const errors = [
      {
        property: 'filters',
        children: [
          {
            property: 'limit',
            constraints: { max: 'limit must not be greater than 100' },
          },
        ],
      },
    ] as ValidationError[];

    expect(formatValidationErrors(errors)).toEqual([
      {
        field: 'filters.limit',
        message: 'limit must not be greater than 100',
        rule: 'max',
      },
    ]);
  });

  it('returns the approved error response format', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/v1/example' }),
        getResponse: () => ({ status, json }),
      }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter().catch(
      new DomainException(
        ApiErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Request validation failed',
        [
          {
            field: 'limit',
            message: 'limit must not be greater than 100',
            rule: 'max',
          },
        ],
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [
          {
            field: 'limit',
            message: 'limit must not be greater than 100',
            rule: 'max',
          },
        ],
        path: '/api/v1/example',
      }),
    );
  });

  it('uses documented pagination defaults and rejects invalid values', async () => {
    const defaults = plainToInstance(BasePaginationQueryDto, {});
    const invalidLimit = plainToInstance(BasePaginationQueryDto, {
      limit: '101',
    });
    const invalidSortOrder = plainToInstance(BasePaginationQueryDto, {
      sortOrder: 'newest',
    });

    expect(defaults).toMatchObject({ page: 1, limit: 20, sortOrder: 'desc' });
    expect(await validate(defaults)).toHaveLength(0);
    expect(await validate(invalidLimit)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'limit' })]),
    );
    expect(await validate(invalidSortOrder)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'sortOrder' }),
      ]),
    );
  });

  it('calculates pagination metadata after validating inputs', () => {
    expect(createPaginationMeta(1, 20, 0)).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
    expect(createPaginationMeta(2, 20, 101)).toEqual({
      page: 2,
      limit: 20,
      total: 101,
      totalPages: 6,
    });
    expect(() => createPaginationMeta(0, 20, 0)).toThrow(RangeError);
  });

  it('creates standard data and paginated response envelopes', () => {
    const meta = createPaginationMeta(1, 20, 1);

    expect(createDataResponse({ id: 'application-id' })).toEqual({
      data: { id: 'application-id' },
    });
    expect(createPaginatedResponse([{ id: 'application-id' }], meta)).toEqual({
      data: [{ id: 'application-id' }],
      meta,
    });
  });

  it('normalizes the API prefix to the NestJS form', () => {
    expect(normalizeApiPrefix('/api/v1')).toBe('api/v1');
    expect(normalizeApiPrefix('api/v1')).toBe('api/v1');
    expect(normalizeApiPrefix(undefined)).toBe('api/v1');
  });

  it('extracts only safe request context fields', () => {
    const context = getRequestContext({
      ip: ' 127.0.0.1 ',
      headers: {
        'user-agent': 'MPWT test client',
        authorization: 'Bearer should-not-be-returned',
        cookie: 'session=should-not-be-returned',
      },
    });

    expect(context).toEqual({ ip: '127.0.0.1', userAgent: 'MPWT test client' });
    expect(context).not.toHaveProperty('authorization');
    expect(context).not.toHaveProperty('cookie');
  });
});
