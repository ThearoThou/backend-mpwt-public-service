import { getMetadataArgsStorage } from 'typeorm';

import { RefreshSession } from '../auth/entities/refresh-session.entity';
import { RenewalApplicationStatusHistory } from '../applications/entities/renewal-application-status-history.entity';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import { InspectionStationDailyCapacity } from '../scheduling/entities/inspection-station-daily-capacity.entity';
import { User } from '../users/entities/user.entity';
import { VehicleClassificationHistory } from '../vehicles/entities/vehicle-classification-history.entity';
import { databaseEntities } from './database.entities';

describe('database entity registry', () => {
  it('registers the approved 20 entities, including daily station capacity', () => {
    expect(databaseEntities).toHaveLength(20);
    expect(databaseEntities).toContain(RefreshSession);
    expect(databaseEntities).toContain(InspectionVehicleCategory);
    expect(databaseEntities).toContain(VehicleClassificationHistory);
    expect(databaseEntities).toContain(RenewalApplicationStatusHistory);
    expect(databaseEntities).toContain(InspectionStationDailyCapacity);
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
