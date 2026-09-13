import type { ThingToTake, ThingToTakeInput } from '@/entities/task';

export const EVENT_SOURCES = ['internal'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export type EventReminder = {
  type: 'exact';
  localDateTime: string;
  timeZone: string;
};

type CalendarEventBase = {
  id: string;
  title: string;
  timeZone: string;
  description: string | null;
  address: string | null;
  travelMinutes: number | null;
  thingsToTake: ThingToTake[];
  reminder: EventReminder | null;
  source: EventSource;
  externalCalendarId: string | null;
  externalEventId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type TimedCalendarEvent = CalendarEventBase & {
  allDay: false;
  startAt: string;
  endAt: string;
  startDate: null;
  endDate: null;
};

export type AllDayCalendarEvent = CalendarEventBase & {
  allDay: true;
  startAt: null;
  endAt: null;
  startDate: string;
  endDate: string;
};

export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

export type EventTimingInput =
  | { allDay: false; start: string; end: string }
  | { allDay: true; startDate: string; endDate: string };

export type EventReminderInput = {
  localDateTime: string;
};

export type EventDetailsInput = {
  description?: string | null;
  address?: string | null;
  travelMinutes?: number | null;
  thingsToTake?: ThingToTakeInput[];
  reminder?: EventReminderInput | null;
};

export type CreateEventInput = EventDetailsInput & {
  title: string;
  timing: EventTimingInput;
};

export type UpdateEventInput = EventDetailsInput & {
  title?: string;
  timing?: EventTimingInput;
};

export type EventField = 'title' | 'start' | 'end' | 'travelMinutes' | 'reminder' | 'thingsToTake';

export type EventStatus = 'upcoming' | 'now' | 'ended';
