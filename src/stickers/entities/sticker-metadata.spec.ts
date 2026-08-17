import { getMetadataArgsStorage } from 'typeorm';

import { Inspection } from '../../inspections/entities/inspection.entity';
import { Sticker } from './sticker.entity';

describe('Phase 7A sticker entity metadata', () => {
  const metadata = getMetadataArgsStorage();

  it('maps the required issued-sticker fields', () => {
    const inspectionId = metadata.columns.find(
      (column) =>
        column.target === Sticker && column.propertyName === 'inspectionId',
    );
    const stickerNumber = metadata.columns.find(
      (column) =>
        column.target === Sticker && column.propertyName === 'stickerNumber',
    );
    const issuedAt = metadata.columns.find(
      (column) =>
        column.target === Sticker && column.propertyName === 'issuedAt',
    );

    expect(inspectionId?.options).toMatchObject({
      name: 'inspection_id',
      type: 'uuid',
    });
    expect(inspectionId?.options.nullable).not.toBe(true);
    expect(stickerNumber?.options).toMatchObject({
      name: 'sticker_number',
      type: 'varchar',
      length: 100,
      unique: true,
    });
    expect(stickerNumber?.options.nullable).not.toBe(true);
    expect(issuedAt?.options).toMatchObject({
      name: 'issued_at',
      type: 'timestamptz',
    });
    expect(issuedAt?.options.nullable).not.toBe(true);
  });

  it('links a sticker one-to-one with its exact inspection', () => {
    const relation = metadata.relations.find(
      (candidate) =>
        candidate.target === Sticker && candidate.propertyName === 'inspection',
    );
    const inverse = metadata.relations.find(
      (candidate) =>
        candidate.target === Inspection && candidate.propertyName === 'sticker',
    );

    expect(relation?.relationType).toBe('one-to-one');
    expect(relation?.type()).toBe(Inspection);
    expect(relation?.options).toMatchObject({
      nullable: false,
      onDelete: 'RESTRICT',
    });
    expect(inverse?.relationType).toBe('one-to-one');
    expect(inverse?.type()).toBe(Sticker);
  });
});
