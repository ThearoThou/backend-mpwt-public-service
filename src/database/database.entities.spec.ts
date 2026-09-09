import { getMetadataArgsStorage } from 'typeorm';

import { RefreshSession } from '../auth/entities/refresh-session.entity';
import { PasswordResetAuthorization } from '../auth/entities/password-reset-authorization.entity';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatusHistory } from '../payments/entities/payment-status-history.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { User } from '../users/entities/user.entity';
import { VehicleClassificationHistory } from '../vehicles/entities/vehicle-classification-history.entity';
import { databaseEntities } from './database.entities';
import { TechnicalInspectionCertificate } from '../certificates/entities/technical-inspection-certificate.entity';

describe('database entity registry', () => {
  it('registers the approved entities, including password reset authorizations', () => {
    expect(databaseEntities).toHaveLength(24);
    expect(databaseEntities).toContain(RefreshSession);
    expect(databaseEntities).toContain(PasswordResetAuthorization);
    expect(databaseEntities).toContain(InspectionVehicleCategory);
    expect(databaseEntities).toContain(VehicleClassificationHistory);
    expect(databaseEntities).toContain(RenewalApplicationStatusHistory);
    expect(databaseEntities).toContain(InspectionStationDailyCapacity);
    expect(databaseEntities).toContain(Payment);
    expect(databaseEntities).toContain(PaymentStatusHistory);
    expect(databaseEntities).toContain(TechnicalInspectionCertificate);
  });

  it('maps only the password-reset token hash and its owning user', () => {
    const metadata = getMetadataArgsStorage();
    const columns = metadata.columns
      .filter((column) => column.target === PasswordResetAuthorization)
      .map((column) => column.propertyName);
    const tokenHashColumn = metadata.columns.find(
      (column) =>
        column.target === PasswordResetAuthorization &&
        column.propertyName === 'tokenHash',
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'userId',
        'tokenHash',
        'expiresAt',
        'usedAt',
        'createdAt',
      ]),
    );
    expect(columns).not.toContain('resetToken');
    expect(tokenHashColumn?.options.select).toBe(false);
  });

  it('maps the refresh-session credential metadata without a raw token field', () => {
    const metadata = getMetadataArgsStorage();
    const columns = metadata.columns
      .filter((column) => column.target === RefreshSession)
      .map((column) => column.propertyName);
    const tokenHashColumn = metadata.columns.find(
      (column) =>
        column.target === RefreshSession && column.propertyName === 'tokenHash',
    );
    const userRelation = metadata.relations.find(
      (relation) =>
        relation.target === RefreshSession && relation.propertyName === 'user',
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'userId',
        'tokenHash',
        'expiresAt',
        'lastUsedAt',
        'revokedAt',
        'revocationReason',
        'reuseDetectedAt',
        'createdAt',
        'updatedAt',
      ]),
    );
    expect(columns).not.toContain('token');
    expect(tokenHashColumn?.options.select).toBe(false);
    expect(userRelation?.relationType).toBe('many-to-one');
    expect(userRelation?.options.onDelete).toBe('CASCADE');
    expect(
      metadata.relations.some(
        (relation) =>
          relation.target === User &&
          relation.propertyName === 'refreshSessions',
      ),
    ).toBe(true);
  });
});
