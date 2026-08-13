import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { ListAdminPaymentsQueryDto } from './payment-request.dtos';

describe('payment request DTOs', () => {
  it('uses locked list defaults and trims search', async () => {
    const input = plainToInstance(ListAdminPaymentsQueryDto, {
      status: PaymentStatus.PENDING,
      method: PaymentMethod.PAY_AT_STATION,
      search: ' INV-20260812 ',
      sortBy: 'totalAmount',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input).toMatchObject({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      search: 'INV-20260812',
      sortBy: 'totalAmount',
    });
  });

  it.each(['payment.createdAt', 'created_at', 'arbitrary'])(
    'rejects unapproved sort field %s',
    async (sortBy) => {
      const input = plainToInstance(ListAdminPaymentsQueryDto, { sortBy });

      expect(await validate(input)).not.toHaveLength(0);
    },
  );
});
