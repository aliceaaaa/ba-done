import {
  addDays,
  addMinutesToLocalDateTime,
  addMonths,
  daysBetween,
  daysInMonth,
  minutesBetweenLocalDateTimes,
  startOfLocalDay,
  startOfMonth,
  startOfWeek,
  isValidLocalDate,
  isValidLocalDateTime,
  isValidLocalTime,
  isValidTimeZone,
  shiftLocalDateTime,
  toLocalDate,
  toLocalDateTime,
  toLocalTime,
  zonedDateTimeToInstant,
} from '../local-date';

describe('local-date', () => {
  it.each([
    ['2026-09-11', 1, '2026-09-12'],
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-03-01', -1, '2026-02-28'],
  ])('addDays(%s, %d) returns %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  it('throws on an invalid date', () => {
    expect(() => addDays('2026-13-01', 1)).toThrow('Invalid local date "2026-13-01"');
  });

  it('resolves the calendar day in the given time zone', () => {
    const lateEvening = new Date('2026-09-11T22:30:00.000Z');
    const earlyMorning = new Date('2026-09-11T05:30:00.000Z');

    expect(toLocalDate(lateEvening, 'UTC')).toBe('2026-09-11');
    expect(toLocalDate(lateEvening, 'Asia/Tokyo')).toBe('2026-09-12');
    expect(toLocalDate(earlyMorning, 'America/Los_Angeles')).toBe('2026-09-10');
  });

  it('converts a local date-time in a time zone into an instant', () => {
    expect(zonedDateTimeToInstant('2026-09-11T19:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-09-11T17:30:00.000Z',
    );
    expect(zonedDateTimeToInstant('2026-09-11T19:30', 'America/New_York').toISOString()).toBe(
      '2026-09-11T23:30:00.000Z',
    );
    expect(zonedDateTimeToInstant('2026-12-01T09:00', 'Asia/Tokyo').toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('handles daylight saving transitions', () => {
    expect(zonedDateTimeToInstant('2026-03-29T09:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T07:00:00.000Z',
    );
    expect(zonedDateTimeToInstant('2026-03-28T09:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-28T08:00:00.000Z',
    );
    const skipped = zonedDateTimeToInstant('2026-03-29T02:30', 'Europe/Berlin');
    expect(toLocalDateTime(skipped, 'Europe/Berlin')).toBe('2026-03-29T03:30');
    const repeated = zonedDateTimeToInstant('2026-10-25T02:30', 'Europe/Berlin');
    expect(toLocalDateTime(repeated, 'Europe/Berlin')).toBe('2026-10-25T02:30');
  });

  it('formats instants as local wall clock values and shifts calendar days', () => {
    const instant = new Date('2026-09-11T22:30:00.000Z');

    expect(toLocalTime(instant, 'Europe/Berlin')).toBe('00:30');
    expect(toLocalDateTime(instant, 'Asia/Tokyo')).toBe('2026-09-12T07:30');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(shiftLocalDateTime('2026-09-11T18:00', 1)).toBe('2026-09-12T18:00');
  });

  it('does wall-clock arithmetic and calendar navigation', () => {
    expect(addMinutesToLocalDateTime('2026-09-11T23:30', 90)).toBe('2026-09-12T01:00');
    expect(minutesBetweenLocalDateTimes('2026-09-11T22:00', '2026-09-12T01:30')).toBe(210);
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07');
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07');
    expect(startOfMonth('2026-09-13')).toBe('2026-09-01');
    expect(daysInMonth('2028-02-10')).toBe(29);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(startOfLocalDay('2026-03-29', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
  });

  it('validates dates, times, date-times and time zones', () => {
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalTime('23:59')).toBe(true);
    expect(isValidLocalTime('24:00')).toBe(false);
    expect(isValidLocalDateTime('2026-09-11T07:30')).toBe(true);
    expect(isValidLocalDateTime('2026-09-11 07:30')).toBe(false);
    expect(isValidLocalDateTime('2026-09-11T07:30T08:00')).toBe(false);
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
