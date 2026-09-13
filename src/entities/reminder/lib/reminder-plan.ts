import type { Task } from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { zonedDateTimeToInstant } from '@/shared/lib/local-date';

import {
  REMINDER_PAYLOAD_KIND,
  REMINDER_PAYLOAD_VERSION,
  type DayPeriodTimes,
  type ReminderPayload,
  type ReminderPlan,
} from '../model/types';

export function reminderNotificationId(taskId: string): string {
  return `${REMINDER_PAYLOAD_KIND}-${taskId}`;
}

export function taskDetailsPath(taskId: string): string {
  return `/task/${taskId}`;
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
    fireAt,
    title: UI_STRINGS.reminderTitle,
    body: task.title,
    payload,
  };
}

export function parseReminderPayload(data: unknown): ReminderPayload | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
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
