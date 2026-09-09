import { getMetadataArgsStorage } from 'typeorm';

import { RenewalApplicationStatusHistory } from '../../applications/entities/renewal-application-status-history.entity';
import { Inspection } from './inspection.entity';

describe('Phase 6 inspection entity metadata', () => {
  const metadata = getMetadataArgsStorage();

  it('maps a required smallint attempt number', () => {
    const attemptNumber = metadata.columns.find(
      (column) =>
        column.target === Inspection && column.propertyName === 'attemptNumber',
    );

    expect(attemptNumber?.options).toMatchObject({
      name: 'attempt_number',
      type: 'smallint',
    });
    expect(attemptNumber?.options.nullable).not.toBe(true);
  });

  it('permits an appointment-free physical attempt while retaining an actual-station relation', () => {
    const appointmentId = metadata.columns.find(
      (column) =>
        column.target === Inspection && column.propertyName === 'appointmentId',
    );
    const actualStationId = metadata.columns.find(
      (column) =>
        column.target === Inspection &&
        column.propertyName === 'actualStationId',
    );
    const actualStation = metadata.relations.find(
      (relation) =>
        relation.target === Inspection &&
        relation.propertyName === 'actualStation',
    );

    expect(appointmentId?.options).toMatchObject({ nullable: true });
    expect(actualStationId?.options).toMatchObject({
      name: 'actual_station_id',
      type: 'uuid',
      nullable: true,
    });
    expect(actualStation?.relationType).toBe('many-to-one');
  });

  it('maps nullable immutable inspection validity facts', () => {
    const validUntil = metadata.columns.find(
      (column) =>
        column.target === Inspection && column.propertyName === 'validUntil',
    );
    const validityRule = metadata.columns.find(
      (column) =>
        column.target === Inspection && column.propertyName === 'validityRule',
    );

    expect(validUntil?.options).toMatchObject({
      name: 'valid_until',
      type: 'date',
      nullable: true,
    });
    expect(validityRule?.options).toMatchObject({
      name: 'validity_rule',
      type: 'varchar',
      length: 60,
      nullable: true,
    });
  });

  it('maps the nullable status-history reason code', () => {
    const reason = metadata.columns.find(
      (column) =>
        column.target === RenewalApplicationStatusHistory &&
        column.propertyName === 'reason',
    );

    expect(reason?.options).toMatchObject({
      name: 'reason',
      type: 'varchar',
      length: 100,
      nullable: true,
    });
  });
});
