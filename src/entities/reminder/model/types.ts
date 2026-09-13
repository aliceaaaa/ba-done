import type { TaskReminder } from '@/entities/task';

export { DEFAULT_DAY_PERIOD_TIMES } from '@/entities/task';
export type { DayPeriodTimes } from '@/entities/task';

export const REMINDER_SCHEDULE_STATUSES = [
  'notScheduled',
  'scheduled',
  'permissionDenied',
  'failed',
] as const;

export type ReminderScheduleStatus = (typeof REMINDER_SCHEDULE_STATUSES)[number];

export const REMINDER_OWNER_TYPES = ['task', 'calendarEvent'] as const;

export type ReminderOwnerType = (typeof REMINDER_OWNER_TYPES)[number];

export type ReminderOwner = {
  ownerType: ReminderOwnerType;
  ownerId: string;
};

export const REMINDER_SCHEDULE_ERRORS = {
  inPast: 'reminder-in-past',
  permissionDenied: 'permission-denied',
  permissionUndetermined: 'permission-undetermined',
} as const;

export type ReminderSchedule = ReminderOwner & {
  scheduledNotificationId: string | null;
  reminderScheduleStatus: ReminderScheduleStatus;
  reminderScheduledAt: string | null;
  reminderScheduleError: string | null;
  fireAt: string | null;
  fingerprint: string | null;
  updatedAt: string;
};

export const REMINDER_PAYLOAD_KIND = 'task-reminder';
export const EVENT_REMINDER_PAYLOAD_KIND = 'event-reminder';
export const REMINDER_PAYLOAD_VERSION = 1;

export const TASK_REMINDER_CATEGORY_ID = 'task-reminder';
export const EVENT_REMINDER_CATEGORY_ID = 'event-reminder';

export type ReminderPayload = {
  kind: typeof REMINDER_PAYLOAD_KIND;
  version: typeof REMINDER_PAYLOAD_VERSION;
  taskId: string;
  scheduledDate: string;
  reminderType: TaskReminder['type'];
  url: string;
  fireAt: string;
  fingerprint: string;
};

export type EventReminderPayload = {
  kind: typeof EVENT_REMINDER_PAYLOAD_KIND;
  version: typeof REMINDER_PAYLOAD_VERSION;
  eventId: string;
  url: string;
  fireAt: string;
  fingerprint: string;
};

export type AnyReminderPayload = ReminderPayload | EventReminderPayload;

export type ReminderPlan =
  | { kind: 'none' }
  | { kind: 'inPast'; fireAt: Date }
  | {
      kind: 'notify';
      identifier: string;
      categoryId: string;
      fireAt: Date;
      title: string;
      body: string;
      payload: AnyReminderPayload;
    };

export type ReminderDisplayState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'scheduled'; fireAt: string }
  | { kind: 'permissionDenied' }
  | { kind: 'failed' }
  | { kind: 'inPast' };
