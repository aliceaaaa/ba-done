import type { SqlDatabase } from '@/database/sql-database';
import type { CalendarEvent, CalendarEventService } from '@/entities/calendar-event';
import {
  REMINDER_SCHEDULE_ERRORS,
  buildSnoozeOptions,
  createAppSettingsRepository,
  createReminderScheduleRepository,
  parseOwnedReminderPayload,
  planEventReminder,
  planReminder,
  reminderOwnerKey,
  type DayPeriodTimes,
  type ReminderDisplayState,
  type ReminderOwner,
  type ReminderOwnerType,
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

export type ReminderSyncEvent = ReminderOwner & {
  outcome: ReminderSyncOutcome;
  requested: boolean;
};

export type SyncOptions = {
  requestPermission?: boolean;
};

export type ReminderCoordinatorDeps = {
  db: SqlDatabase;
  service: TaskService;
  events: CalendarEventService;
  adapter: NotificationAdapter;
  now: () => Date;
  timeZone: () => string;
};

export type ReminderCoordinator = {
  syncTask(taskId: string, options?: SyncOptions): Promise<ReminderSyncOutcome>;
  syncEvent(eventId: string, options?: SyncOptions): Promise<ReminderSyncOutcome>;
  reconcile(): Promise<void>;
  refresh(): Promise<void>;
  getSchedule(taskId: string): Promise<ReminderSchedule | null>;
  getOwnerSchedule(ownerType: ReminderOwnerType, ownerId: string): Promise<ReminderSchedule | null>;
  getDisplayState(task: Task): Promise<ReminderDisplayState>;
  getEventDisplayState(event: CalendarEvent): Promise<ReminderDisplayState>;
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

type OwnedPlan = ReminderOwner & {
  plan: ReminderPlan;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createReminderCoordinator({
  db,
  service,
  events,
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

  async function planFor(owner: ReminderOwner): Promise<ReminderPlan> {
    if (owner.ownerType === 'task') {
      const result = await service.getTask(owner.ownerId);
      return planReminder(
        result.ok ? result.value : null,
        await settings.getDayPeriodTimes(),
        now(),
      );
    }
    const result = await events.getEvent(owner.ownerId);
    return planEventReminder(result.ok ? result.value : null, now(), timeZone());
  }

  async function save(
    owner: ReminderOwner,
    fields: Omit<ReminderSchedule, 'ownerType' | 'ownerId' | 'updatedAt'>,
  ): Promise<void> {
    await schedules.save({ ...fields, ...owner, updatedAt: now().toISOString() });
  }

  async function cancelExisting(existing: ReminderSchedule | null): Promise<void> {
    if (existing !== null && existing.scheduledNotificationId !== null) {
      await adapter.cancel(existing.scheduledNotificationId);
    }
  }

  async function applyPlan(
    owner: ReminderOwner,
    plan: ReminderPlan,
    permission: () => Promise<NotificationPermission>,
    options: ApplyOptions,
  ): Promise<ReminderSyncOutcome> {
    const existing = await schedules.get(owner.ownerType, owner.ownerId);

    if (plan.kind === 'none') {
      if (existing === null) {
        return 'none';
      }
      try {
        await cancelExisting(existing);
        await schedules.delete(owner.ownerType, owner.ownerId);
        return 'none';
      } catch (error) {
        await save(owner, {
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
        await save(owner, {
          scheduledNotificationId: null,
          reminderScheduleStatus: 'failed',
          reminderScheduledAt: null,
          reminderScheduleError: errorMessage(error),
          fireAt: plan.fireAt.toISOString(),
          fingerprint: null,
        });
        return 'failed';
      }
      await save(owner, {
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
        await save(owner, {
          scheduledNotificationId: null,
          reminderScheduleStatus: 'failed',
          reminderScheduledAt: null,
          reminderScheduleError: 'Could not cancel a notification after permission was revoked',
          fireAt,
          fingerprint,
        });
        return 'failed';
      }
      await save(owner, {
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
        categoryId: plan.categoryId,
        title: plan.title,
        body: plan.body,
        fireAt: plan.fireAt,
        data: plan.payload,
      });
      await save(owner, {
        scheduledNotificationId: notificationId,
        reminderScheduleStatus: 'scheduled',
        reminderScheduledAt: now().toISOString(),
        reminderScheduleError: null,
        fireAt,
        fingerprint,
      });
      return 'scheduled';
    } catch (error) {
      await save(owner, {
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

  async function collectPlans(): Promise<Map<string, OwnedPlan>> {
    const times = await settings.getDayPeriodTimes();
    const instant = now();
    const zone = timeZone();
    const plans = new Map<string, OwnedPlan>();
    for (const task of await service.getTasksWithReminders()) {
      const owner: ReminderOwner = { ownerType: 'task', ownerId: task.id };
      plans.set(reminderOwnerKey(owner), { ...owner, plan: planReminder(task, times, instant) });
    }
    for (const event of await events.getEventsWithReminders()) {
      const owner: ReminderOwner = { ownerType: 'calendarEvent', ownerId: event.id };
      plans.set(reminderOwnerKey(owner), {
        ...owner,
        plan: planEventReminder(event, instant, zone),
      });
    }
    return plans;
  }

  async function reconcileInner(): Promise<void> {
    const plans = await collectPlans();
    const permission = await adapter.getPermission();
    const ours = new Map<string, ScheduledNotification>();

    for (const notification of await adapter.listScheduled()) {
      const owner = parseOwnedReminderPayload(notification.data);
      if (owner === null) {
        continue;
      }
      const key = reminderOwnerKey(owner);
      const plan = plans.get(key)?.plan;
      const isWanted =
        plan?.kind === 'notify' &&
        permission.status === 'granted' &&
        plan.identifier === notification.identifier &&
        !ours.has(key);
      if (isWanted) {
        ours.set(key, notification);
      } else {
        await adapter.cancel(notification.identifier);
      }
    }

    for (const record of await schedules.listAll()) {
      if (!plans.has(reminderOwnerKey(record))) {
        await schedules.delete(record.ownerType, record.ownerId);
      }
    }

    for (const [key, owned] of plans) {
      const owner: ReminderOwner = { ownerType: owned.ownerType, ownerId: owned.ownerId };
      const { plan } = owned;
      const present = ours.get(key);
      const presentOwner = present === undefined ? null : parseOwnedReminderPayload(present.data);
      if (
        plan.kind === 'notify' &&
        present !== undefined &&
        presentOwner?.fingerprint === plan.payload.fingerprint
      ) {
        const existing = await schedules.get(owner.ownerType, owner.ownerId);
        if (
          existing?.reminderScheduleStatus !== 'scheduled' ||
          existing.scheduledNotificationId !== present.identifier ||
          existing.fingerprint !== plan.payload.fingerprint
        ) {
          await save(owner, {
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
      await applyPlan(owner, plan, async () => permission, { trustExistingRecord: false });
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

  function syncOwner(owner: ReminderOwner, options: SyncOptions): Promise<ReminderSyncOutcome> {
    return exclusive(async () => {
      const requested = options.requestPermission ?? false;
      const plan = await planFor(owner);
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
      const outcome = await applyPlan(owner, plan, permission, { trustExistingRecord: true });
      if (grantedNow) {
        await reconcileInner();
      }
      emit({ ...owner, outcome, requested });
      return outcome;
    });
  }

  function displayStateFor(
    schedule: ReminderSchedule | null,
    plan: ReminderPlan,
  ): ReminderDisplayState {
    if (plan.kind === 'none') {
      return { kind: 'none' };
    }
    if (plan.kind === 'inPast') {
      return { kind: 'inPast' };
    }
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
  }

  return {
    syncTask(taskId, options = {}) {
      return syncOwner({ ownerType: 'task', ownerId: taskId }, options);
    },

    syncEvent(eventId, options = {}) {
      return syncOwner({ ownerType: 'calendarEvent', ownerId: eventId }, options);
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
      return schedules.get('task', taskId);
    },

    getOwnerSchedule(ownerType, ownerId) {
      return schedules.get(ownerType, ownerId);
    },

    async getDisplayState(task) {
      const plan = planReminder(task, await settings.getDayPeriodTimes(), now());
      return displayStateFor(await schedules.get('task', task.id), plan);
    },

    async getEventDisplayState(event) {
      const plan = planEventReminder(event, now(), timeZone());
      return displayStateFor(await schedules.get('calendarEvent', event.id), plan);
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
