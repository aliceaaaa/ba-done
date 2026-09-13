import type { SqlDatabase } from '@/database/sql-database';
import {
  REMINDER_SCHEDULE_ERRORS,
  buildSnoozeOptions,
  createAppSettingsRepository,
  createReminderScheduleRepository,
  parseReminderPayload,
  planReminder,
  type DayPeriodTimes,
  type ReminderDisplayState,
  type ReminderPlan,
  type ReminderSchedule,
  type SnoozeOption,
} from '@/entities/reminder';
import type { DayPeriod, Task, TaskService } from '@/entities/task';

import type {
  ExactAlarmSupport,
  NotificationAdapter,
  NotificationPermission,
  ScheduledNotification,
} from './notification-adapter';

export type ReminderSyncOutcome = 'none' | 'scheduled' | 'permissionDenied' | 'failed' | 'inPast';

export type ReminderSyncEvent = {
  taskId: string;
  outcome: ReminderSyncOutcome;
  requested: boolean;
};

export type SyncOptions = {
  requestPermission?: boolean;
};

export type ReminderCoordinatorDeps = {
  db: SqlDatabase;
  service: TaskService;
  adapter: NotificationAdapter;
  now: () => Date;
  timeZone: () => string;
};

export type ReminderCoordinator = {
  syncTask(taskId: string, options?: SyncOptions): Promise<ReminderSyncOutcome>;
  reconcile(): Promise<void>;
  refresh(): Promise<void>;
  getSchedule(taskId: string): Promise<ReminderSchedule | null>;
  getDisplayState(task: Task): Promise<ReminderDisplayState>;
  getDayPeriodTimes(): Promise<DayPeriodTimes>;
  setDayPeriodTime(period: DayPeriod, time: string): Promise<void>;
  getSnoozeOptions(): Promise<SnoozeOption[]>;
  getPermission(): Promise<NotificationPermission>;
  openSettings(): Promise<void>;
  getExactAlarmSupport(): ExactAlarmSupport;
  subscribe(listener: (event: ReminderSyncEvent) => void): () => void;
  getNow(): Date;
  getTimeZone(): string;
};

type ApplyOptions = {
  trustExistingRecord: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createReminderCoordinator({
  db,
  service,
  adapter,
  now,
  timeZone,
}: ReminderCoordinatorDeps): ReminderCoordinator {
  const schedules = createReminderScheduleRepository(db);
  const settings = createAppSettingsRepository(db);
  const listeners = new Set<(event: ReminderSyncEvent) => void>();
  let queue: Promise<unknown> = Promise.resolve();

  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work);
    queue = next.catch(() => undefined);
    return next;
  }

  function emit(event: ReminderSyncEvent) {
    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  async function loadTask(taskId: string): Promise<Task | null> {
    const result = await service.getTask(taskId);
    return result.ok ? result.value : null;
  }

  async function save(
    taskId: string,
    fields: Omit<ReminderSchedule, 'taskId' | 'updatedAt'>,
  ): Promise<void> {
    await schedules.save({ ...fields, taskId, updatedAt: now().toISOString() });
  }

  async function cancelExisting(existing: ReminderSchedule | null): Promise<void> {
    if (existing?.scheduledNotificationId !== null && existing !== null) {
      await adapter.cancel(existing.scheduledNotificationId);
    }
  }

  async function applyPlan(
    taskId: string,
    plan: ReminderPlan,
    permission: () => Promise<NotificationPermission>,
    options: ApplyOptions,
  ): Promise<ReminderSyncOutcome> {
    const existing = await schedules.get(taskId);

    if (plan.kind === 'none') {
      if (existing === null) {
        return 'none';
      }
      try {
        await cancelExisting(existing);
        await schedules.delete(taskId);
        return 'none';
      } catch (error) {
        await save(taskId, {
          scheduledNotificationId: null,
          reminderScheduleStatus: 'failed',
          reminderScheduledAt: null,
          reminderScheduleError: errorMessage(error),
          fireAt: existing.fireAt,
          fingerprint: null,
        });
        return 'failed';
      }
    }

    if (plan.kind === 'inPast') {
      try {
        await cancelExisting(existing);
      } catch (error) {
        await save(taskId, {
          scheduledNotificationId: null,
          reminderScheduleStatus: 'failed',
          reminderScheduledAt: null,
          reminderScheduleError: errorMessage(error),
          fireAt: plan.fireAt.toISOString(),
          fingerprint: null,
        });
        return 'failed';
      }
      await save(taskId, {
        scheduledNotificationId: null,
        reminderScheduleStatus: 'notScheduled',
        reminderScheduledAt: null,
        reminderScheduleError: REMINDER_SCHEDULE_ERRORS.inPast,
        fireAt: plan.fireAt.toISOString(),
        fingerprint: null,
      });
      return 'inPast';
    }

    const fireAt = plan.fireAt.toISOString();
    const { fingerprint } = plan.payload;
    const isCurrent =
      options.trustExistingRecord &&
      existing?.reminderScheduleStatus === 'scheduled' &&
      existing.fingerprint === fingerprint;
    if (isCurrent) {
      return 'scheduled';
    }

    const access = await permission();
    if (access.status !== 'granted') {
      try {
        await cancelExisting(existing);
      } catch {
        await save(taskId, {
          scheduledNotificationId: null,
          reminderScheduleStatus: 'failed',
          reminderScheduledAt: null,
          reminderScheduleError: 'Could not cancel a notification after permission was revoked',
          fireAt,
          fingerprint,
        });
        return 'failed';
      }
      await save(taskId, {
        scheduledNotificationId: null,
        reminderScheduleStatus: 'permissionDenied',
        reminderScheduledAt: null,
        reminderScheduleError:
          access.status === 'denied'
            ? REMINDER_SCHEDULE_ERRORS.permissionDenied
            : REMINDER_SCHEDULE_ERRORS.permissionUndetermined,
        fireAt,
        fingerprint,
      });
      return 'permissionDenied';
    }

    try {
      await cancelExisting(existing);
      const notificationId = await adapter.schedule({
        identifier: plan.identifier,
        title: plan.title,
        body: plan.body,
        fireAt: plan.fireAt,
        data: plan.payload,
      });
      await save(taskId, {
        scheduledNotificationId: notificationId,
        reminderScheduleStatus: 'scheduled',
        reminderScheduledAt: now().toISOString(),
        reminderScheduleError: null,
        fireAt,
        fingerprint,
      });
      return 'scheduled';
    } catch (error) {
      await save(taskId, {
        scheduledNotificationId: null,
        reminderScheduleStatus: 'failed',
        reminderScheduledAt: null,
        reminderScheduleError: errorMessage(error),
        fireAt,
        fingerprint,
      });
      return 'failed';
    }
  }

  async function reconcileInner(): Promise<void> {
    const times = await settings.getDayPeriodTimes();
    const instant = now();
    const tasks = await service.getTasksWithReminders();
    const plans = new Map(tasks.map((task) => [task.id, planReminder(task, times, instant)]));
    const permission = await adapter.getPermission();
    const ours = new Map<string, ScheduledNotification>();

    for (const notification of await adapter.listScheduled()) {
      const payload = parseReminderPayload(notification.data);
      if (payload === null) {
        continue;
      }
      const plan = plans.get(payload.taskId);
      const isWanted =
        plan?.kind === 'notify' &&
        permission.status === 'granted' &&
        plan.identifier === notification.identifier &&
        !ours.has(payload.taskId);
      if (isWanted) {
        ours.set(payload.taskId, notification);
      } else {
        await adapter.cancel(notification.identifier);
      }
    }

    for (const record of await schedules.listAll()) {
      if (!plans.has(record.taskId)) {
        await schedules.delete(record.taskId);
      }
    }

    for (const task of tasks) {
      const plan = plans.get(task.id) ?? { kind: 'none' };
      const present = ours.get(task.id);
      const presentPayload = present === undefined ? null : parseReminderPayload(present.data);
      if (
        plan.kind === 'notify' &&
        present !== undefined &&
        presentPayload?.fingerprint === plan.payload.fingerprint
      ) {
        const existing = await schedules.get(task.id);
        if (
          existing?.reminderScheduleStatus !== 'scheduled' ||
          existing.scheduledNotificationId !== present.identifier ||
          existing.fingerprint !== plan.payload.fingerprint
        ) {
          await save(task.id, {
            scheduledNotificationId: present.identifier,
            reminderScheduleStatus: 'scheduled',
            reminderScheduledAt: existing?.reminderScheduledAt ?? now().toISOString(),
            reminderScheduleError: null,
            fireAt: plan.payload.fireAt,
            fingerprint: plan.payload.fingerprint,
          });
        }
        continue;
      }
      await applyPlan(task.id, plan, async () => permission, { trustExistingRecord: false });
    }
  }

  async function checkTimeZoneInner(): Promise<void> {
    const current = timeZone();
    const last = await settings.getLastTimeZone();
    if (last === current) {
      return;
    }
    const rebased = await service.rebaseReminderTimeZones(current);
    if (rebased.ok) {
      await settings.setLastTimeZone(current);
    }
  }

  return {
    syncTask(taskId, options = {}) {
      return exclusive(async () => {
        const requested = options.requestPermission ?? false;
        const task = await loadTask(taskId);
        const plan = planReminder(task, await settings.getDayPeriodTimes(), now());
        let grantedNow = false;
        const permission = async () => {
          const current = await adapter.getPermission();
          if (current.status !== 'undetermined' || !requested) {
            return current;
          }
          const answer = await adapter.requestPermission();
          grantedNow = answer.status === 'granted';
          return answer;
        };
        const outcome = await applyPlan(taskId, plan, permission, { trustExistingRecord: true });
        if (grantedNow) {
          await reconcileInner();
        }
        emit({ taskId, outcome, requested });
        return outcome;
      });
    },

    reconcile() {
      return exclusive(reconcileInner);
    },

    refresh() {
      return exclusive(async () => {
        await checkTimeZoneInner();
        await reconcileInner();
      });
    },

    getSchedule(taskId) {
      return schedules.get(taskId);
    },

    async getDisplayState(task) {
      if (task.reminder === null || task.scheduledDate === null || task.status !== 'active') {
        return { kind: 'none' };
      }
      const plan = planReminder(task, await settings.getDayPeriodTimes(), now());
      if (plan.kind === 'inPast') {
        return { kind: 'inPast' };
      }
      const schedule = await schedules.get(task.id);
      switch (schedule?.reminderScheduleStatus) {
        case 'scheduled':
          return { kind: 'scheduled', fireAt: schedule.fireAt ?? '' };
        case 'permissionDenied':
          return { kind: 'permissionDenied' };
        case 'failed':
          return { kind: 'failed' };
        default:
          return { kind: 'pending' };
      }
    },

    getDayPeriodTimes() {
      return settings.getDayPeriodTimes();
    },

    setDayPeriodTime(period, time) {
      return exclusive(async () => {
        await settings.setDayPeriodTime(period, time);
        await reconcileInner();
      });
    },

    async getSnoozeOptions() {
      return buildSnoozeOptions(now(), timeZone(), await settings.getDayPeriodTimes());
    },

    getPermission() {
      return adapter.getPermission();
    },

    openSettings() {
      return adapter.openSettings();
    },

    getExactAlarmSupport() {
      return adapter.getExactAlarmSupport();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getNow() {
      return now();
    },

    getTimeZone() {
      return timeZone();
    },
  };
}
