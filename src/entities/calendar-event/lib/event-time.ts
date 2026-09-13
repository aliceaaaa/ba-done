import { addDays, startOfLocalDay, toLocalDate, toLocalDateTime } from '@/shared/lib/local-date';

import type { CalendarEvent, EventStatus } from '../model/types';

export type EventLocalTiming = {
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

export function eventLocalTiming(event: CalendarEvent, timeZone: string): EventLocalTiming {
  if (event.allDay) {
    return {
      allDay: true,
      startDate: event.startDate,
      startTime: '09:00',
      endDate: event.endDate,
      endTime: '10:00',
    };
  }
  const [startDate = '', startTime = ''] = toLocalDateTime(new Date(event.startAt), timeZone).split(
    'T',
  );
  const [endDate = '', endTime = ''] = toLocalDateTime(new Date(event.endAt), timeZone).split('T');
  return { allDay: false, startDate, startTime, endDate, endTime };
}

export function eventOccursOn(event: CalendarEvent, date: string, timeZone: string): boolean {
  if (event.allDay) {
    return event.startDate <= date && event.endDate >= date;
  }
  const dayStart = startOfLocalDay(date, timeZone).getTime();
  const dayEnd = startOfLocalDay(addDays(date, 1), timeZone).getTime();
  return Date.parse(event.startAt) < dayEnd && Date.parse(event.endAt) > dayStart;
}

export function eventLocalDates(event: CalendarEvent, timeZone: string): string[] {
  const first = event.allDay ? event.startDate : toLocalDate(new Date(event.startAt), timeZone);
  const last = event.allDay
    ? event.endDate
    : toLocalDate(new Date(Date.parse(event.endAt) - 1), timeZone);
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function eventStatus(event: CalendarEvent, now: Date, timeZone: string): EventStatus {
  const instant = now.getTime();
  const start = event.allDay
    ? startOfLocalDay(event.startDate, timeZone).getTime()
    : Date.parse(event.startAt);
  const end = event.allDay
    ? startOfLocalDay(addDays(event.endDate, 1), timeZone).getTime()
    : Date.parse(event.endAt);
  if (instant < start) {
    return 'upcoming';
  }
  return instant < end ? 'now' : 'ended';
}
