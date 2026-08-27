import 'reflect-metadata';

import { CAMBODIA_PUBLIC_HOLIDAYS_2026 } from '../../scripts/cambodia-public-holiday-fixtures';
import { CitizenPreferredSchedulingService } from './citizen-preferred-scheduling.service';
import { InspectionStation } from './entities/inspection-station.entity';

const STATION_ID = '11111111-1111-4111-8111-111111111111';

describe('CitizenPreferredSchedulingService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-24T05:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('allows Day 1 through Day 30 weekdays without station or capacity checks', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.validatePreferredDate('2026-08-24'),
    ).resolves.toBeUndefined();
    await expect(
      fixture.service.validatePreferredDate('2026-09-22'),
    ).resolves.toBeUndefined();
    expect(fixture.manager.getRepository).not.toHaveBeenCalled();
  });

  it.each([
    ['yesterday', '2026-08-23'],
    ['past date', '2026-08-21'],
    ['weekend', '2026-08-29'],
    ['Day 31', '2026-09-23'],
    ['invalid calendar date', '2026-08-32'],
  ])('rejects a %s preferred date', async (_reason, date) => {
    const fixture = createFixture();
    await expect(fixture.service.validatePreferredDate(date)).rejects.toThrow(
      'not currently selectable',
    );
  });

  it('rejects an active Cambodian public holiday but ignores an inactive record', async () => {
    const fixture = createFixture();
    fixture.calendar.isActiveClosure.mockResolvedValueOnce(true);

    await expect(
      fixture.service.validatePreferredDate('2026-08-25'),
    ).rejects.toThrow('not currently selectable');

    fixture.calendar.isActiveClosure.mockResolvedValueOnce(false);
    await expect(
      fixture.service.validatePreferredDate('2026-08-25'),
    ).resolves.toBeUndefined();
  });

  it('rejects the seeded official 2026 Labour Day and Visak Bochea date', async () => {
    const fixture = createFixture();
    jest.setSystemTime(new Date('2026-04-20T05:00:00.000Z'));
    const officialDate = CAMBODIA_PUBLIC_HOLIDAYS_2026.find(
      ({ closureDate }) => closureDate === '2026-05-01',
    );
    if (officialDate === undefined)
      throw new Error('Missing official fixture.');
    fixture.calendar.isActiveClosure.mockResolvedValueOnce(true);

    await expect(
      fixture.service.validatePreferredDate(officialDate.closureDate),
    ).rejects.toThrow('not currently selectable');
  });

  it('allows today at 16:59 Cambodia time and rejects it at 17:00', async () => {
    const fixture = createFixture();
    jest.setSystemTime(new Date('2026-08-24T09:59:59.000Z'));
    await expect(
      fixture.service.validatePreferredDate('2026-08-24'),
    ).resolves.toBeUndefined();

    jest.setSystemTime(new Date('2026-08-24T10:00:00.000Z'));
    await expect(
      fixture.service.validatePreferredDate('2026-08-24'),
    ).rejects.toThrow('not currently selectable');
    await expect(
      fixture.service.validatePreferredDate('2026-08-25'),
    ).resolves.toBeUndefined();
  });

  it('accepts a selected active station but allows it to be omitted', async () => {
    const fixture = createFixture();
    await expect(
      fixture.service.validateOptionalStationWithManager(fixture.manager, null),
    ).resolves.toBeUndefined();
    await expect(
      fixture.service.validateOptionalStationWithManager(
        fixture.manager,
        STATION_ID,
      ),
    ).resolves.toBeUndefined();
    expect(fixture.stations.findOne).toHaveBeenCalledWith({
      where: { id: STATION_ID, isActive: true },
    });
  });

  it('rejects a supplied inactive station', async () => {
    const fixture = createFixture();
    fixture.stations.findOne.mockResolvedValue(null);
    await expect(
      fixture.service.validateOptionalStationWithManager(
        fixture.manager,
        STATION_ID,
      ),
    ).rejects.toThrow('Inspection station not found');
  });

  it('uses the Cambodia submission date through Day 30 inclusively', async () => {
    const fixture = createFixture();
    const submittedAt = new Date('2026-08-24T05:00:00.000Z');

    await expect(
      fixture.service.validatePreferredDateForSubmission(
        '2026-08-24',
        submittedAt,
      ),
    ).resolves.toBeUndefined();
    await expect(
      fixture.service.validatePreferredDateForSubmission(
        '2026-09-22',
        submittedAt,
      ),
    ).resolves.toBeUndefined();
    await expect(
      fixture.service.validatePreferredDateForSubmission(
        '2026-09-23',
        submittedAt,
      ),
    ).rejects.toThrow('not currently selectable');
  });

  it.each([
    ['date before submission', '2026-08-21'],
    ['weekend within submission window', '2026-08-29'],
    ['Day 31', '2026-09-23'],
  ])('rejects submission when preferred date is %s', async (_reason, date) => {
    const fixture = createFixture();
    await expect(
      fixture.service.validatePreferredDateForSubmission(
        date,
        new Date('2026-08-24T05:00:00.000Z'),
      ),
    ).rejects.toThrow('not currently selectable');
  });

  it('rejects a holiday and same-day submission after the 17:00 cutoff', async () => {
    const fixture = createFixture();
    fixture.calendar.isActiveClosure.mockResolvedValueOnce(true);
    await expect(
      fixture.service.validatePreferredDateForSubmission(
        '2026-08-25',
        new Date('2026-08-24T05:00:00.000Z'),
      ),
    ).rejects.toThrow('not currently selectable');

    await expect(
      fixture.service.validatePreferredDateForSubmission(
        '2026-08-24',
        new Date('2026-08-24T10:00:00.000Z'),
      ),
    ).rejects.toThrow('not currently selectable');
  });
});

function createFixture() {
  const stations = { findOne: jest.fn().mockResolvedValue(station()) };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === InspectionStation) return stations;
      throw new Error('Unexpected repository');
    }),
  };
  const calendar = { isActiveClosure: jest.fn().mockResolvedValue(false) };
  return {
    service: new CitizenPreferredSchedulingService(
      stations as never,
      calendar as never,
    ),
    stations,
    manager: manager as never,
    calendar,
  };
}

function station(): InspectionStation {
  return {
    id: STATION_ID,
    code: 'PP-01',
    nameKh: 'Station Khmer',
    nameEn: 'Station English',
    province: 'Phnom Penh',
    address: 'Address',
    phone: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
