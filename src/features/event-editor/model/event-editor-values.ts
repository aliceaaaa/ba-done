import {
  eventLocalTiming,
  type CalendarEvent,
  type CreateEventInput,
  type EventReminderInput,
} from '@/entities/calendar-event';
import { newThingDraft, type ThingDraft } from '@/features/task-editor';
import {
  addDays,
  addMinutesToLocalDateTime,
  daysBetween,
  minutesBetweenLocalDateTimes,
  toLocalDate,
  toLocalDateTime,
} from '@/shared/lib/local-date';

export const DEFAULT_EVENT_MINUTES = 60;
export const DEFAULT_START_TIME = '09:00';
export const DEFAULT_REMINDER_OFFSET_MINUTES = 30;

export type EventEditorValues = {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  description: string;
  address: string;
  travelMinutes: string;
  things: ThingDraft[];
  reminderEnabled: boolean;
  reminderDate: string;
  reminderTime: string;
};

function splitLocalDateTime(localDateTime: string): [string, string] {
  const [date = '', time = ''] = localDateTime.split('T');
  return [date, time];
}

function nextFullHour(now: Date, timeZone: string): string {
  const local = toLocalDateTime(now, timeZone);
  const [date, time] = splitLocalDateTime(local);
  return addMinutesToLocalDateTime(`${date}T${time.slice(0, 2)}:00`, 60);
}

export function createEventEditorValues(
  date: string,
  now: Date,
  timeZone: string,
): EventEditorValues {
  const start =
    date === toLocalDate(now, timeZone)
      ? nextFullHour(now, timeZone)
      : `${date}T${DEFAULT_START_TIME}`;
  const [startDate, startTime] = splitLocalDateTime(start);
  const [endDate, endTime] = splitLocalDateTime(
    addMinutesToLocalDateTime(start, DEFAULT_EVENT_MINUTES),
  );
  return {
    title: '',
    allDay: false,
    startDate,
    startTime,
    endDate,
    endTime,
    description: '',
    address: '',
    travelMinutes: '',
    things: [],
    reminderEnabled: false,
    reminderDate: startDate,
    reminderTime: startTime,
  };
}

export function eventEditorValuesFromEvent(
  event: CalendarEvent,
  timeZone: string,
): EventEditorValues {
  const timing = eventLocalTiming(event, timeZone);
  const [reminderDate, reminderTime] =
    event.reminder === null
      ? [timing.startDate, timing.startTime]
      : splitLocalDateTime(event.reminder.localDateTime);
  return {
    title: event.title,
    allDay: timing.allDay,
    startDate: timing.startDate,
    startTime: timing.startTime,
    endDate: timing.endDate,
    endTime: timing.endTime,
    description: event.description ?? '',
    address: event.address ?? '',
    travelMinutes: event.travelMinutes === null ? '' : String(event.travelMinutes),
    things: event.thingsToTake.map((item) => newThingDraft(item.text, item.checked)),
    reminderEnabled: event.reminder !== null,
    reminderDate,
    reminderTime,
  };
}

function startOf(values: EventEditorValues): string {
  return `${values.startDate}T${values.startTime}`;
}

function endOf(values: EventEditorValues): string {
  return `${values.endDate}T${values.endTime}`;
}

export function changeStart(
  values: EventEditorValues,
  startDate: string,
  startTime: string,
): EventEditorValues {
  if (values.allDay) {
    const spanDays = Math.max(0, daysBetween(values.startDate, values.endDate));
    return { ...values, startDate, startTime, endDate: addDays(startDate, spanDays) };
  }
  const previousMinutes = minutesBetweenLocalDateTimes(startOf(values), endOf(values));
  const duration = previousMinutes > 0 ? previousMinutes : DEFAULT_EVENT_MINUTES;
  const [endDate, endTime] = splitLocalDateTime(
    addMinutesToLocalDateTime(`${startDate}T${startTime}`, duration),
  );
  return { ...values, startDate, startTime, endDate, endTime };
}

export function changeEnd(
  values: EventEditorValues,
  endDate: string,
  endTime: string,
): EventEditorValues {
  return { ...values, endDate, endTime };
}

export function setAllDay(values: EventEditorValues, allDay: boolean): EventEditorValues {
  if (allDay === values.allDay) {
    return values;
  }
  if (allDay) {
    const endsAtMidnight = values.endTime === '00:00' && values.endDate > values.startDate;
    const endDate = endsAtMidnight ? addDays(values.endDate, -1) : values.endDate;
    return {
      ...values,
      allDay: true,
      startTime: DEFAULT_START_TIME,
      endDate: endDate < values.startDate ? values.startDate : endDate,
      endTime: DEFAULT_START_TIME,
    };
  }
  const start = `${values.startDate}T${DEFAULT_START_TIME}`;
  const [defaultEndDate, defaultEndTime] = splitLocalDateTime(
    addMinutesToLocalDateTime(start, DEFAULT_EVENT_MINUTES),
  );
  return {
    ...values,
    allDay: false,
    startTime: DEFAULT_START_TIME,
    endDate: values.endDate > values.startDate ? values.endDate : defaultEndDate,
    endTime: defaultEndTime,
  };
}

export function setReminderEnabled(values: EventEditorValues, enabled: boolean): EventEditorValues {
  if (!enabled) {
    return { ...values, reminderEnabled: false };
  }
  const base = values.allDay
    ? `${values.startDate}T${DEFAULT_START_TIME}`
    : addMinutesToLocalDateTime(startOf(values), -DEFAULT_REMINDER_OFFSET_MINUTES);
  const [reminderDate, reminderTime] = splitLocalDateTime(base);
  return { ...values, reminderEnabled: true, reminderDate, reminderTime };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : Number(trimmed);
}

function reminderOf(values: EventEditorValues): EventReminderInput | null {
  return values.reminderEnabled
    ? { localDateTime: `${values.reminderDate}T${values.reminderTime}` }
    : null;
}

export function toEventInput(
  values: EventEditorValues,
  initial: EventEditorValues | null,
): CreateEventInput {
  const reminder = reminderOf(values);
  const reminderChanged =
    initial === null || JSON.stringify(reminder) !== JSON.stringify(reminderOf(initial));
  return {
    title: values.title,
    timing: values.allDay
      ? { allDay: true, startDate: values.startDate, endDate: values.endDate }
      : { allDay: false, start: startOf(values), end: endOf(values) },
    description: values.description,
    address: values.address,
    travelMinutes: parseOptionalNumber(values.travelMinutes),
    thingsToTake: values.things.map((item) => ({ text: item.text, checked: item.checked })),
    ...(reminderChanged ? { reminder } : {}),
  };
}
