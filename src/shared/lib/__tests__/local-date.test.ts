import {
  addDays,
  isValidLocalDate,
  isValidLocalDateTime,
  isValidLocalTime,
  isValidTimeZone,
  toLocalDate,
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
