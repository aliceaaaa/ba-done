import {
  eventStatus,
  formatEventNotificationBody,
  type CalendarEvent,
} from '@/entities/calendar-event';
import type { Task } from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { zonedDateTimeToInstant } from '@/shared/lib/local-date';

import {
  EVENT_REMINDER_CATEGORY_ID,
  EVENT_REMINDER_PAYLOAD_KIND,
  REMINDER_PAYLOAD_KIND,
  REMINDER_PAYLOAD_VERSION,
  TASK_REMINDER_CATEGORY_ID,
  type DayPeriodTimes,
  type EventReminderPayload,
  type ReminderOwner,
  type ReminderPayload,
  type ReminderPlan,
} from '../model/types';

export function reminderNotificationId(taskId: string): string {
  return `${REMINDER_PAYLOAD_KIND}-${taskId}`;
}

export function eventReminderNotificationId(eventId: string): string {
  return `${EVENT_REMINDER_PAYLOAD_KIND}-${eventId}`;
}

export function taskDetailsPath(taskId: string): string {
  return `/task/${taskId}`;
}

export function eventDetailsPath(eventId: string): string {
  return `/event/${eventId}`;
}

export function reminderLocalDateTime(task: Task, times: DayPeriodTimes): string | null {
  if (task.reminder === null || task.scheduledDate === null) {
    return null;
  }
  return task.reminder.type === 'exact'
    ? task.reminder.localDateTime
    : `${task.scheduledDate}T${times[task.reminder.period]}`;
}

export function resolveReminderFireAt(task: Task, times: DayPeriodTimes): Date | null {
  const localDateTime = reminderLocalDateTime(task, times);
  if (localDateTime === null || task.reminder === null) {
    return null;
  }
  return zonedDateTimeToInstant(localDateTime, task.reminder.timeZone);
}

export function planReminder(task: Task | null, times: DayPeriodTimes, now: Date): ReminderPlan {
  if (task === null || task.status !== 'active' || task.scheduledDate === null) {
    return { kind: 'none' };
  }
  const fireAt = resolveReminderFireAt(task, times);
  if (fireAt === null || task.reminder === null) {
    return { kind: 'none' };
  }
  if (fireAt.getTime() <= now.getTime()) {
    return { kind: 'inPast', fireAt };
  }
  const fingerprint = [task.id, fireAt.toISOString(), task.scheduledDate, task.title].join('|');
  const payload: ReminderPayload = {
    kind: REMINDER_PAYLOAD_KIND,
    version: REMINDER_PAYLOAD_VERSION,
    taskId: task.id,
    scheduledDate: task.scheduledDate,
    reminderType: task.reminder.type,
    url: taskDetailsPath(task.id),
    fireAt: fireAt.toISOString(),
    fingerprint,
  };
  return {
    kind: 'notify',
    identifier: reminderNotificationId(task.id),
    categoryId: TASK_REMINDER_CATEGORY_ID,
    fireAt,
    title: UI_STRINGS.reminderTitle,
    body: task.title,
    payload,
  };
}

export function planEventReminder(
  event: CalendarEvent | null,
  now: Date,
  timeZone: string,
): ReminderPlan {
  if (event === null || event.deletedAt !== null || event.reminder === null) {
    return { kind: 'none' };
  }
  const fireAt = zonedDateTimeToInstant(event.reminder.localDateTime, event.reminder.timeZone);
  if (fireAt.getTime() <= now.getTime() || eventStatus(event, now, timeZone) === 'ended') {
    return { kind: 'inPast', fireAt };
  }
  const body = formatEventNotificationBody(event, timeZone);
  const fingerprint = [event.id, fireAt.toISOString(), body].join('|');
  const payload: EventReminderPayload = {
    kind: EVENT_REMINDER_PAYLOAD_KIND,
    version: REMINDER_PAYLOAD_VERSION,
    eventId: event.id,
    url: eventDetailsPath(event.id),
    fireAt: fireAt.toISOString(),
    fingerprint,
  };
  return {
    kind: 'notify',
    identifier: eventReminderNotificationId(event.id),
    categoryId: EVENT_REMINDER_CATEGORY_ID,
    fireAt,
    title: UI_STRINGS.reminderTitle,
    body,
    payload,
  };
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
}

export function parseReminderPayload(data: unknown): ReminderPayload | null {
  const record = asRecord(data);
  if (record === null) {
    return null;
  }
  const { kind, version, taskId, scheduledDate, reminderType, url, fireAt, fingerprint } = record;
  if (
    kind !== REMINDER_PAYLOAD_KIND ||
    version !== REMINDER_PAYLOAD_VERSION ||
    typeof taskId !== 'string' ||
    taskId.length === 0 ||
    typeof scheduledDate !== 'string' ||
    (reminderType !== 'exact' && reminderType !== 'dayPeriod') ||
    typeof url !== 'string' ||
    typeof fireAt !== 'string' ||
    typeof fingerprint !== 'string'
  ) {
    return null;
  }
  return {
    kind,
    version,
    taskId,
    scheduledDate,
    reminderType,
    url,
    fireAt,
    fingerprint,
  };
}

export function parseEventReminderPayload(data: unknown): EventReminderPayload | null {
  const record = asRecord(data);
  if (record === null) {
    return null;
  }
  const { kind, version, eventId, url, fireAt, fingerprint } = record;
  if (
    kind !== EVENT_REMINDER_PAYLOAD_KIND ||
    version !== REMINDER_PAYLOAD_VERSION ||
    typeof eventId !== 'string' ||
    eventId.length === 0 ||
    typeof url !== 'string' ||
    typeof fireAt !== 'string' ||
    typeof fingerprint !== 'string'
  ) {
    return null;
  }
  return { kind, version, eventId, url, fireAt, fingerprint };
}

export function parseOwnedReminderPayload(
  data: unknown,
): (ReminderOwner & { fingerprint: string }) | null {
  const task = parseReminderPayload(data);
  if (task !== null) {
    return { ownerType: 'task', ownerId: task.taskId, fingerprint: task.fingerprint };
  }
  const event = parseEventReminderPayload(data);
  return event === null
    ? null
    : { ownerType: 'calendarEvent', ownerId: event.eventId, fingerprint: event.fingerprint };
}

export function reminderOwnerKey(owner: ReminderOwner): string {
  return `${owner.ownerType}:${owner.ownerId}`;
}
