import {
  getInitialApplicationExpiryDate,
  getInitialApplicationLastValidDate,
  isInitialApplicationPeriodExpired,
} from './initial-application-expiry';

describe('initial application expiry policy', () => {
  const submittedAt = new Date('2026-09-07T08:30:00.000Z'); // 15:30 Cambodia

  it('counts the Cambodia submission date as Day 1 and Day 30 as the last valid date', () => {
    expect(getInitialApplicationLastValidDate(submittedAt)).toBe('2026-10-06');
    expect(getInitialApplicationExpiryDate(submittedAt)).toBe('2026-10-07');
  });

  it.each([
    ['Day 30 00:00', '2026-10-05T17:00:00.000Z', false],
    ['Day 30 16:59', '2026-10-06T09:59:00.000Z', false],
    ['Day 30 17:00', '2026-10-06T10:00:00.000Z', false],
    ['Day 30 18:30', '2026-10-06T11:30:00.000Z', false],
    ['Day 30 23:59:59', '2026-10-06T16:59:59.000Z', false],
    ['Day 31 00:00', '2026-10-06T17:00:00.000Z', true],
    ['Day 31 00:00:01', '2026-10-06T17:00:01.000Z', true],
  ])('%s has the expected calendar validity', (_name, now, expired) => {
    expect(isInitialApplicationPeriodExpired(submittedAt, new Date(now))).toBe(
      expired,
    );
  });

  it('uses the Cambodia submission date when it differs from the UTC date', () => {
    const cambodiaSeptember8 = new Date('2026-09-07T18:00:00.000Z');
    expect(getInitialApplicationLastValidDate(cambodiaSeptember8)).toBe(
      '2026-10-07',
    );
    expect(
      isInitialApplicationPeriodExpired(
        cambodiaSeptember8,
        new Date('2026-10-07T16:59:59.000Z'),
      ),
    ).toBe(false);
    expect(
      isInitialApplicationPeriodExpired(
        cambodiaSeptember8,
        new Date('2026-10-07T17:00:00.000Z'),
      ),
    ).toBe(true);
  });
});
