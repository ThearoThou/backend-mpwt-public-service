import {
  CAMBODIA_PUBLIC_HOLIDAYS_2026,
  CAMBODIA_PUBLIC_HOLIDAYS_2026_COUNT,
} from '../../scripts/cambodia-public-holiday-fixtures';

describe('official Cambodian public-holiday fixtures for 2026', () => {
  it('contains exactly 21 unique official dates and no other year', () => {
    const dates = CAMBODIA_PUBLIC_HOLIDAYS_2026.map(
      ({ closureDate }) => closureDate,
    );

    expect(dates).toHaveLength(CAMBODIA_PUBLIC_HOLIDAYS_2026_COUNT);
    expect(new Set(dates).size).toBe(CAMBODIA_PUBLIC_HOLIDAYS_2026_COUNT);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]).toBe('2026-01-01');
    expect(dates.at(-1)).toBe('2026-12-29');
    expect(dates).toEqual(
      expect.arrayContaining(['2026-04-14', '2026-04-15', '2026-04-16']),
    );
    expect(dates.every((date) => date.startsWith('2026-'))).toBe(true);
  });
});
