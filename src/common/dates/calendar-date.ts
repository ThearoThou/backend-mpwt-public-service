const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function addCalendarYears(date: string, years: number): string {
  if (!Number.isSafeInteger(years) || years < 0 || !isCalendarDate(date)) {
    throw new Error('Calendar-year addition requires a valid date and years.');
  }

  const [year, month, day] = date.split('-').map(Number);
  const targetYear = year + years;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, month, 0),
  ).getUTCDate();
  const targetDay = Math.min(day, lastDayOfTargetMonth);
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function calendarDayDifference(from: string, to: string): number {
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    throw new Error('Calendar-day difference requires valid date-only values.');
  }
  return calendarDayNumber(to) - calendarDayNumber(from);
}

function calendarDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
