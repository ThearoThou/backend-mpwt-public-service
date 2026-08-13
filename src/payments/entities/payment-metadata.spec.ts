import { getMetadataArgsStorage } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Payment } from './payment.entity';
import { PaymentStatusHistory } from './payment-status-history.entity';

describe('payment entity metadata', () => {
  const metadata = getMetadataArgsStorage();

  it('maps the Migration 10 payment snapshot columns', () => {
    const baseAmount = metadata.columns.find(
      (column) =>
        column.target === Payment && column.propertyName === 'baseAmount',
    );
    const inspectionFeeKhr = metadata.columns.find(
      (column) =>
        column.target === Payment && column.propertyName === 'inspectionFeeKhr',
    );
    const serviceFeeKhr = metadata.columns.find(
      (column) =>
        column.target === Payment && column.propertyName === 'serviceFeeKhr',
    );
    const previousInspectionExpiryDate = metadata.columns.find(
      (column) =>
        column.target === Payment &&
        column.propertyName === 'previousInspectionExpiryDate',
    );
    const lateDays = metadata.columns.find(
      (column) =>
        column.target === Payment && column.propertyName === 'lateDays',
    );
    const inspectionSheetFileKey = metadata.columns.find(
      (column) =>
        column.target === Payment &&
        column.propertyName === 'inspectionSheetFileKey',
    );

    expect(previousInspectionExpiryDate?.options).toMatchObject({
      name: 'previous_inspection_expiry_date',
      type: 'date',
    });
    expect(inspectionFeeKhr?.options).toMatchObject({
      name: 'inspection_fee_khr',
      type: 'numeric',
      precision: 12,
      scale: 2,
    });
    expect(serviceFeeKhr?.options).toMatchObject({
      name: 'service_fee_khr',
      type: 'numeric',
      precision: 12,
      scale: 2,
    });
    expect(inspectionFeeKhr?.options.nullable).toBe(
      baseAmount?.options.nullable,
    );
    expect(serviceFeeKhr?.options.nullable).toBe(baseAmount?.options.nullable);
    expect(lateDays?.options).toMatchObject({
      name: 'late_days',
      type: 'integer',
    });
    expect(inspectionSheetFileKey?.options).toMatchObject({
      name: 'inspection_sheet_file_key',
      type: 'varchar',
      length: 500,
      nullable: true,
    });
  });

  it('maps payment status history columns, relations, and indexes', () => {
    const columns = metadata.columns
      .filter((column) => column.target === PaymentStatusHistory)
      .map((column) => column.propertyName);
    const payment = metadata.relations.find(
      (relation) =>
        relation.target === PaymentStatusHistory &&
        relation.propertyName === 'payment',
    );
    const changedByUser = metadata.relations.find(
      (relation) =>
        relation.target === PaymentStatusHistory &&
        relation.propertyName === 'changedByUser',
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'paymentId',
        'fromStatus',
        'toStatus',
        'changedByUserId',
        'reason',
        'createdAt',
      ]),
    );
    expect(payment?.relationType).toBe('many-to-one');
    expect(payment?.options).toMatchObject({
      nullable: false,
      onDelete: 'RESTRICT',
    });
    expect(changedByUser?.relationType).toBe('many-to-one');
    expect(changedByUser?.options).toMatchObject({
      nullable: true,
      onDelete: 'SET NULL',
    });
    expect(
      metadata.indices.some(
        (index) =>
          index.target === PaymentStatusHistory &&
          index.name === 'idx_payment_status_history_payment_created',
      ),
    ).toBe(true);
    expect(
      metadata.indices.some(
        (index) =>
          index.target === PaymentStatusHistory &&
          index.name === 'idx_payment_status_history_changed_by_user',
      ),
    ).toBe(true);
    expect(
      metadata.relations.some(
        (relation) =>
          relation.target === Payment &&
          relation.propertyName === 'statusHistory',
      ),
    ).toBe(true);
    expect(
      metadata.relations.some(
        (relation) =>
          relation.target === User &&
          relation.propertyName === 'changedPaymentStatusHistory',
      ),
    ).toBe(true);
  });
});
