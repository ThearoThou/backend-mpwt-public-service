import { getMetadataArgsStorage } from 'typeorm';

import { RenewalApplication } from '../../applications/entities/renewal-application.entity';
import { Appointment } from './appointment.entity';
import { InspectionStationDailyCapacity } from './inspection-station-daily-capacity.entity';
import { InspectionStation } from './inspection-station.entity';

describe('Phase 4 scheduling entity metadata', () => {
  const metadata = getMetadataArgsStorage();

  it('maps every daily station capacity column and station relation', () => {
    const columns = metadata.columns
      .filter((column) => column.target === InspectionStationDailyCapacity)
      .map((column) => column.propertyName);
    const station = metadata.relations.find(
      (relation) =>
        relation.target === InspectionStationDailyCapacity &&
        relation.propertyName === 'station',
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'stationId',
        'capacityDate',
        'dailyCapacity',
        'reservedCount',
        'isClosed',
        'createdAt',
        'updatedAt',
      ]),
    );
    expect(station?.relationType).toBe('many-to-one');
    expect(station?.options).toMatchObject({
      nullable: false,
      onDelete: 'RESTRICT',
    });
    expect(
      metadata.indices.some(
        (index) =>
          index.target === InspectionStationDailyCapacity &&
          index.name ===
            'uq_inspection_station_daily_capacities_station_date' &&
          index.unique === true,
      ),
    ).toBe(true);
  });

  it('maps nullable application preferences and their station relation', () => {
    const stationId = metadata.columns.find(
      (column) =>
        column.target === RenewalApplication &&
        column.propertyName === 'preferredInspectionStationId',
    );
    const date = metadata.columns.find(
      (column) =>
        column.target === RenewalApplication &&
        column.propertyName === 'preferredInspectionDate',
    );
    const station = metadata.relations.find(
      (relation) =>
        relation.target === RenewalApplication &&
        relation.propertyName === 'preferredInspectionStation',
    );

    expect(stationId?.options).toMatchObject({
      name: 'preferred_inspection_station_id',
      type: 'uuid',
      nullable: true,
    });
    expect(date?.options).toMatchObject({
      name: 'preferred_inspection_date',
      type: 'date',
      nullable: true,
    });
    expect(station?.relationType).toBe('many-to-one');
    expect(station?.options).toMatchObject({
      nullable: true,
      onDelete: 'RESTRICT',
    });
  });

  it('maps either appointment scheduling source as nullable', () => {
    const slotId = metadata.columns.find(
      (column) =>
        column.target === Appointment && column.propertyName === 'slotId',
    );
    const dailyCapacityId = metadata.columns.find(
      (column) =>
        column.target === Appointment &&
        column.propertyName === 'dailyCapacityId',
    );
    const slot = metadata.relations.find(
      (relation) =>
        relation.target === Appointment && relation.propertyName === 'slot',
    );
    const dailyCapacity = metadata.relations.find(
      (relation) =>
        relation.target === Appointment &&
        relation.propertyName === 'dailyCapacity',
    );

    expect(slotId?.options).toMatchObject({ nullable: true });
    expect(dailyCapacityId?.options).toMatchObject({
      name: 'daily_capacity_id',
      type: 'uuid',
      nullable: true,
    });
    expect(slot?.options).toMatchObject({
      nullable: true,
      onDelete: 'RESTRICT',
    });
    expect(dailyCapacity?.relationType).toBe('many-to-one');
    expect(dailyCapacity?.options).toMatchObject({
      nullable: true,
      onDelete: 'RESTRICT',
    });
  });

  it('adds the expected station inverse relations', () => {
    const relations = metadata.relations
      .filter((relation) => relation.target === InspectionStation)
      .map((relation) => relation.propertyName);

    expect(relations).toEqual(
      expect.arrayContaining([
        'dailyCapacities',
        'preferredRenewalApplications',
      ]),
    );
  });
});
