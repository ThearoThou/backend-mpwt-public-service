import { getMetadataArgsStorage } from 'typeorm';

import { RefreshSession } from '../auth/entities/refresh-session.entity';
import { User } from '../users/entities/user.entity';
import { databaseEntities } from './database.entities';

describe('database entity registry', () => {
  it('registers the approved 16 entities, including refresh sessions', () => {
    expect(databaseEntities).toHaveLength(16);
    expect(databaseEntities).toContain(RefreshSession);
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
