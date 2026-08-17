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
