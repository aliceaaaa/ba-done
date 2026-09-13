import { addDays, startOfLocalDay, toLocalDate } from '@/shared/lib/local-date';

import type { CalendarEvent } from '../model/types';

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateFormatters.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  });
  dateFormatters.set(timeZone, formatter);
  return formatter;
}

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = timeFormatters.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
  timeFormatters.set(timeZone, formatter);
  return formatter;
}

export const EVENT_LABELS = {
  allDay: 'All day',
  happeningNow: 'Happening now',
  ended: 'Ended',
  overlaps: 'Overlaps another event',
} as const;

export function formatCalendarDate(date: string): string {
  return dateFormatter('UTC').format(new Date(`${date}T12:00:00.000Z`));
}

export function formatInstantTime(instant: string, timeZone: string): string {
  return timeFormatter(timeZone).format(new Date(instant));
}

export function formatInstantDate(instant: string, timeZone: string): string {
  return dateFormatter(timeZone).format(new Date(instant));
}

export function formatEventDates(event: CalendarEvent, timeZone: string): string {
  if (event.allDay) {
    return event.startDate === event.endDate
      ? formatCalendarDate(event.startDate)
      : `${formatCalendarDate(event.startDate)} – ${formatCalendarDate(event.endDate)}`;
  }
  const startDate = toLocalDate(new Date(event.startAt), timeZone);
  const endDate = toLocalDate(new Date(Date.parse(event.endAt) - 1), timeZone);
  return startDate === endDate
    ? formatCalendarDate(startDate)
    : `${formatCalendarDate(startDate)} – ${formatCalendarDate(endDate)}`;
}

export function formatEventTimes(event: CalendarEvent, timeZone: string): string {
  if (event.allDay) {
    return EVENT_LABELS.allDay;
  }
  const start = formatInstantTime(event.startAt, timeZone);
  const end = formatInstantTime(event.endAt, timeZone);
  const sameDay =
    toLocalDate(new Date(event.startAt), timeZone) ===
    toLocalDate(new Date(Date.parse(event.endAt) - 1), timeZone);
  return sameDay
    ? `${start} – ${end}`
    : `${formatInstantDate(event.startAt, timeZone)}, ${start} – ${formatInstantDate(event.endAt, timeZone)}, ${end}`;
}

export function formatEventTimesForDay(
  event: CalendarEvent,
  date: string,
  timeZone: string,
): string {
  if (event.allDay) {
    return EVENT_LABELS.allDay;
  }
  const dayStart = startOfLocalDay(date, timeZone).getTime();
  const dayEnd = startOfLocalDay(addDays(date, 1), timeZone).getTime();
  const startsBefore = Date.parse(event.startAt) < dayStart;
  const endsAfter = Date.parse(event.endAt) > dayEnd;
  const start = formatInstantTime(event.startAt, timeZone);
  const end = formatInstantTime(event.endAt, timeZone);
  if (startsBefore && endsAfter) {
    return 'Continues all day';
  }
  if (startsBefore) {
    return `Until ${end} (started ${formatInstantDate(event.startAt, timeZone)})`;
  }
  if (endsAfter) {
    return `${start} – ${end} next day`;
  }
  return `${start} – ${end}`;
}

export function formatEventNotificationBody(event: CalendarEvent, timeZone: string): string {
  const when = event.allDay
    ? `${formatCalendarDate(event.startDate)}, ${EVENT_LABELS.allDay}`
    : `${formatInstantDate(event.startAt, timeZone)}, ${formatInstantTime(event.startAt, timeZone)}`;
  return `${event.title} · ${when}`;
}
