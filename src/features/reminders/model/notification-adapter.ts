import {
  EVENT_REMINDER_CATEGORY_ID,
  TASK_REMINDER_CATEGORY_ID,
  type AnyReminderPayload,
} from '@/entities/reminder';

export const REMINDER_CATEGORY_ID = TASK_REMINDER_CATEGORY_ID;
export { EVENT_REMINDER_CATEGORY_ID };
export const REMINDER_CHANNEL_ID = 'reminders';

export const REMINDER_ACTIONS = {
  open: 'default',
  done: 'done',
  notTonight: 'not-tonight',
  remindLater: 'remind-later',
  changePriority: 'change-priority',
} as const;

export const EVENT_REMINDER_ACTIONS = {
  tap: REMINDER_ACTIONS.open,
  open: 'open-event',
  remindLater: REMINDER_ACTIONS.remindLater,
} as const;

export type ReminderActionId = (typeof REMINDER_ACTIONS)[keyof typeof REMINDER_ACTIONS];

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export type NotificationPermission = {
  status: PermissionStatus;
  canAskAgain: boolean;
};

export type ScheduleNotificationRequest = {
  identifier: string;
  categoryId: string;
  title: string;
  body: string;
  fireAt: Date;
  data: AnyReminderPayload;
};

export type ScheduledNotification = {
  identifier: string;
  data: Record<string, unknown>;
};

export type NotificationResponseInput = {
  responseId: string;
  actionIdentifier: string;
  data: Record<string, unknown>;
};

export type ExactAlarmSupport = 'exact' | 'mayBeDelayed';

export type NotificationAdapter = {
  initialize(): Promise<void>;
  getPermission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  schedule(request: ScheduleNotificationRequest): Promise<string>;
  cancel(identifier: string): Promise<void>;
  listScheduled(): Promise<ScheduledNotification[]>;
  openSettings(): Promise<void>;
  getExactAlarmSupport(): ExactAlarmSupport;
  addResponseListener(listener: (response: NotificationResponseInput) => void): () => void;
  getLastResponse(): Promise<NotificationResponseInput | null>;
  clearLastResponse(): Promise<void>;
};
