const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function parseLocalDate(value: string): DateParts | null {
  const match = DATE_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isValid ? { year, month, day } : null;
}

export function isValidLocalDate(value: string): boolean {
  return parseLocalDate(value) !== null;
}

export function isValidLocalTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isValidLocalDateTime(value: string): boolean {
  const [date, time, ...rest] = value.split('T');
  return (
    rest.length === 0 &&
    date !== undefined &&
    time !== undefined &&
    isValidLocalDate(date) &&
    isValidLocalTime(time)
  );
}

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0) {
    return false;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

export function addDays(value: string, days: number): string {
  const parts = parseLocalDate(value);
  if (parts === null) {
    throw new Error(`Invalid local date "${value}"`);
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
    .toISOString()
    .slice(0, 10);
}

export function toLocalDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = read('year');
  const month = read('month');
  const day = read('day');
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Cannot resolve the local date in time zone "${timeZone}"`);
  }
  return `${year.padStart(4, '0')}-${month}-${day}`;
}
