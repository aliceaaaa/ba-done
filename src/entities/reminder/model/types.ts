import type { DayPeriod, TaskReminder } from '@/entities/task';

export const REMINDER_SCHEDULE_STATUSES = [
  'notScheduled',
  'scheduled',
  'permissionDenied',
  'failed',
] as const;

export type ReminderScheduleStatus = (typeof REMINDER_SCHEDULE_STATUSES)[number];

export const REMINDER_SCHEDULE_ERRORS = {
  inPast: 'reminder-in-past',
  permissionDenied: 'permission-denied',
  permissionUndetermined: 'permission-undetermined',
} as const;

export type ReminderSchedule = {
  taskId: string;
  scheduledNotificationId: string | null;
  reminderScheduleStatus: ReminderScheduleStatus;
  reminderScheduledAt: string | null;
  reminderScheduleError: string | null;
  fireAt: string | null;
  fingerprint: string | null;
  updatedAt: string;
};

export type DayPeriodTimes = Record<DayPeriod, string>;

export const DEFAULT_DAY_PERIOD_TIMES: DayPeriodTimes = {
  morning: '09:00',
  afternoon: '13:00',
  evening: '18:00',
  night: '21:00',
};

export const REMINDER_PAYLOAD_KIND = 'task-reminder';
export const REMINDER_PAYLOAD_VERSION = 1;

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

export type ReminderPlan =
  | { kind: 'none' }
  | { kind: 'inPast'; fireAt: Date }
  | {
      kind: 'notify';
      identifier: string;
      fireAt: Date;
      title: string;
      body: string;
      payload: ReminderPayload;
    };

export type ReminderDisplayState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'scheduled'; fireAt: string }
  | { kind: 'permissionDenied' }
  | { kind: 'failed' }
  | { kind: 'inPast' };
