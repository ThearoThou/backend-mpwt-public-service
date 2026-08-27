import { addCalendarYears, calendarDayDifference } from './calendar-date';

describe('date-only calendar-year arithmetic', () => {
  it('counts a two-year period crossing a leap day as 731 calendar days', () => {
    const capDate = addCalendarYears('2023-03-01', 2);
    expect(capDate).toBe('2025-03-01');
    expect(calendarDayDifference('2023-03-01', capDate)).toBe(731);
  });

  it('counts a two-year period without a leap day as 730 calendar days', () => {
    const capDate = addCalendarYears('2024-03-01', 2);
    expect(capDate).toBe('2026-03-01');
    expect(calendarDayDifference('2024-03-01', capDate)).toBe(730);
  });

  it('clamps leap-day anniversaries to the last valid February day', () => {
    expect(addCalendarYears('2024-02-29', 2)).toBe('2026-02-28');
  });
});
