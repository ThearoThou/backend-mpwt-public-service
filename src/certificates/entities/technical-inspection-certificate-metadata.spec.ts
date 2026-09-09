import { getMetadataArgsStorage } from 'typeorm';

import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { Inspection } from '../../inspections/entities/inspection.entity';
import { User } from '../../users/entities/user.entity';
import { TechnicalInspectionCertificate } from './technical-inspection-certificate.entity';

describe('TechnicalInspectionCertificate entity metadata', () => {
  const metadata = getMetadataArgsStorage();

  it('maps only the minimal immutable certificate fields', () => {
    const columns = metadata.columns
      .filter((column) => column.target === TechnicalInspectionCertificate)
      .map((column) => column.propertyName);

    expect(columns).toEqual([
      'id',
      'applicationId',
      'inspectionId',
      'certificateNumber',
      'issuedAt',
      'issuedByUserId',
      'artifactFileKey',
      'createdAt',
    ]);
    for (const propertyName of [
      'applicationId',
      'inspectionId',
      'certificateNumber',
      'artifactFileKey',
    ]) {
      expect(column(propertyName)?.options.unique).toBe(true);
    }
    expect(column('certificateNumber')?.options).toMatchObject({
      name: 'certificate_number',
      type: 'varchar',
      length: 100,
    });
    expect(column('issuedAt')?.options).toMatchObject({
      name: 'issued_at',
      type: 'timestamptz',
    });
    expect(column('artifactFileKey')?.options).toMatchObject({
      name: 'artifact_file_key',
      type: 'varchar',
      length: 500,
    });
    expect(column('issuedByUserId')?.options).toMatchObject({
      name: 'issued_by_user_id',
      type: 'uuid',
      nullable: true,
    });
  });

  it('maps required certificate owners and optional inverse relations', () => {
    expect(
      relation(TechnicalInspectionCertificate, 'application'),
    ).toMatchObject({
      relationType: 'one-to-one',
    });
    expect(
      relation(TechnicalInspectionCertificate, 'application')?.options,
    ).toMatchObject({ nullable: false, onDelete: 'RESTRICT' });
    expect(
      relation(TechnicalInspectionCertificate, 'application')?.type(),
    ).toBe(RenewalApplication);
    expect(relation(TechnicalInspectionCertificate, 'inspection')?.type()).toBe(
      Inspection,
    );
    expect(
      relation(TechnicalInspectionCertificate, 'issuedByUser')?.type(),
    ).toBe(User);
    expect(
      relation(TechnicalInspectionCertificate, 'issuedByUser')?.options,
    ).toMatchObject({ nullable: true, onDelete: 'SET NULL' });
    expect(
      relation(RenewalApplication, 'technicalInspectionCertificate')?.options,
    ).toMatchObject({ nullable: true });
    expect(
      relation(Inspection, 'technicalInspectionCertificate')?.options,
    ).toMatchObject({ nullable: true });
  });

  it('declares the trimmed non-empty certificate-number check', () => {
    const check = metadata.checks.find(
      (candidate) =>
        candidate.target === TechnicalInspectionCertificate &&
        candidate.name ===
          'chk_technical_inspection_certificates_number_trimmed_nonempty',
    );
    expect(check?.expression).toContain('btrim("certificate_number")');
    expect(check?.expression).toContain('"certificate_number" <> \'\'');
  });

  function column(propertyName: string) {
    return metadata.columns.find(
      (candidate) =>
        candidate.target === TechnicalInspectionCertificate &&
        candidate.propertyName === propertyName,
    );
  }

  function relation(target: unknown, propertyName: string) {
    return metadata.relations.find(
      (candidate) =>
        candidate.target === target && candidate.propertyName === propertyName,
    );
  }
});
