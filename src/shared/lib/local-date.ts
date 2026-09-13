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

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = wallClockFormatters.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  wallClockFormatters.set(timeZone, formatter);
  return formatter;
}

function wallClockAt(instant: number, timeZone: string): WallClock {
  const parts = wallClockFormatter(timeZone).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) {
      throw new Error(`Cannot resolve wall clock time in time zone "${timeZone}"`);
    }
    return Number(value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
}

function offsetAt(instant: number, timeZone: string): number {
  const wall = wallClockAt(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function zonedDateTimeToInstant(localDateTime: string, timeZone: string): Date {
  if (!isValidLocalDateTime(localDateTime)) {
    throw new Error(`Invalid local date-time "${localDateTime}"`);
  }
  const [date = '', time = ''] = localDateTime.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  const firstOffset = offsetAt(wall, timeZone);
  const firstGuess = wall - firstOffset;
  const secondOffset = offsetAt(firstGuess, timeZone);
  if (firstOffset === secondOffset) {
    return new Date(firstGuess);
  }
  const secondGuess = wall - secondOffset;
  const thirdOffset = offsetAt(secondGuess, timeZone);
  if (secondOffset === thirdOffset) {
    return new Date(secondGuess);
  }
  return new Date(wall - Math.min(secondOffset, thirdOffset));
}

export function toLocalTime(instant: Date, timeZone: string): string {
  const wall = wallClockAt(instant.getTime(), timeZone);
  return `${pad(wall.hour)}:${pad(wall.minute)}`;
}

export function toLocalDateTime(instant: Date, timeZone: string): string {
  return `${toLocalDate(instant, timeZone)}T${toLocalTime(instant, timeZone)}`;
}

export function roundUpToMinute(instant: Date): Date {
  return new Date(Math.ceil(instant.getTime() / MINUTE_MS) * MINUTE_MS);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE_MS);
}

export function daysBetween(from: string, to: string): number {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  if (start === null || end === null) {
    throw new Error(`Invalid local dates "${from}" and "${to}"`);
  }
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / DAY_MS);
}

export function shiftLocalDateTime(localDateTime: string, days: number): string {
  const [date = '', time = ''] = localDateTime.split('T');
  return `${addDays(date, days)}T${time}`;
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
