import {
  addDays,
  addMonths,
  daysInMonth,
  startOfMonth,
  startOfWeek,
} from '@/shared/lib/local-date';

export const CALENDAR_MODES = ['day', 'week', 'month'] as const;
export type CalendarMode = (typeof CALENDAR_MODES)[number];

export const CALENDAR_MODE_LABELS: Record<CalendarMode, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

export type DateRange = {
  from: string;
  to: string;
};

export function shiftSelectedDate(date: string, mode: CalendarMode, direction: 1 | -1): string {
  switch (mode) {
    case 'day':
      return addDays(date, direction);
    case 'week':
      return addDays(date, 7 * direction);
    case 'month':
      return addMonths(date, direction);
  }
}

export function weekDates(date: string): string[] {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

export function monthGridDates(date: string): string[] {
  const first = startOfMonth(date);
  const gridStart = startOfWeek(first);
  const last = addDays(first, daysInMonth(first) - 1);
  const dates: string[] = [];
  for (
    let cursor = gridStart;
    cursor <= last || dates.length % 7 !== 0;
    cursor = addDays(cursor, 1)
  ) {
    dates.push(cursor);
  }
  return dates;
}

export function periodRange(date: string, mode: CalendarMode): DateRange {
  if (mode === 'day') {
    return { from: date, to: date };
  }
  const dates = mode === 'week' ? weekDates(date) : monthGridDates(date);
  return { from: dates[0] ?? date, to: dates[dates.length - 1] ?? date };
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });

function asUtcNoon(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

export function formatPeriodLabel(date: string, mode: CalendarMode): string {
  if (mode === 'day') {
    return dayFormatter.format(asUtcNoon(date));
  }
  if (mode === 'month') {
    return monthFormatter.format(asUtcNoon(date));
  }
  const dates = weekDates(date);
  const first = dates[0] ?? date;
  const last = dates[6] ?? date;
  return `${shortFormatter.format(asUtcNoon(first))} – ${shortFormatter.format(asUtcNoon(last))}`;
}

export function formatDayLong(date: string): string {
  return dayFormatter.format(asUtcNoon(date));
}

export function formatWeekday(date: string): string {
  return weekdayFormatter.format(asUtcNoon(date));
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
