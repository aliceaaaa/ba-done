import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import { reminderNotificationId } from '@/entities/reminder';
import type { CreateTaskInput, RankedTask, ReminderInput } from '@/entities/task';
import {
  TODAY,
  TOMORROW,
  createTestDatabase,
  createTestReminders,
  unwrap,
  type TestReminders,
} from '@/test-utils/test-app';

import { DENIED, GRANTED, UNDETERMINED } from '../testing/fake-notification-adapter';

const EVENING_REMINDER: ReminderInput = { type: 'exact', localDateTime: '2026-09-11T19:30' };

describe('ReminderCoordinator', () => {
  let db: NodeSqliteDatabase;
  let app: TestReminders;

  async function create(input: Partial<CreateTaskInput> = {}): Promise<RankedTask> {
    return unwrap(
      await app.service.createTask({
        title: 'Dentist',
        scheduledDate: TODAY,
        priority: 5,
        reminder: EVENING_REMINDER,
        ...input,
      }),
    );
  }

  function scheduledFor(taskId: string) {
    return app.adapter.scheduled.get(reminderNotificationId(taskId));
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    app = createTestReminders(db, { permission: GRANTED });
  });

  afterEach(() => {
    db.close();
  });

  describe('scheduling', () => {
    it('schedules an exact reminder with the right trigger and saves the notification id', async () => {
      const task = await create();

      expect(scheduledFor(task.id)).toMatchObject({
        identifier: `task-reminder-${task.id}`,
        title: 'Still interested?',
        body: 'Dentist',
        fireAt: new Date('2026-09-11T17:30:00.000Z'),
        data: {
          taskId: task.id,
          scheduledDate: TODAY,
          reminderType: 'exact',
          url: `/task/${task.id}`,
          version: 1,
        },
      });
      expect(await app.coordinator.getSchedule(task.id)).toMatchObject({
        scheduledNotificationId: `task-reminder-${task.id}`,
        reminderScheduleStatus: 'scheduled',
        reminderScheduleError: null,
        fireAt: '2026-09-11T17:30:00.000Z',
      });
      expect(app.adapter.scheduled.size).toBe(1);
    });

    it('uses the user setting for a day-period reminder', async () => {
      await app.coordinator.setDayPeriodTime('evening', '19:15');

      const task = await create({ reminder: { type: 'dayPeriod', period: 'evening' } });

      expect(scheduledFor(task.id)?.fireAt).toEqual(new Date('2026-09-11T17:15:00.000Z'));
    });

    it('rejects an exact reminder in the past and schedules nothing', async () => {
      const result = await app.service.createTask({
        title: 'Late',
        scheduledDate: TODAY,
        priority: 5,
        reminder: { type: 'exact', localDateTime: '2026-09-11T09:00' },
      });

      expect(result).toMatchObject({
        ok: false,
        error: { issues: [{ field: 'reminder', message: 'Choose a reminder time in the future' }] },
      });
      expect(app.adapter.calls.schedule).toEqual([]);
    });

    it('keeps a day-period reminder that already passed as not scheduled', async () => {
      const task = await create({ reminder: { type: 'dayPeriod', period: 'morning' } });

      expect(app.adapter.scheduled.size).toBe(0);
      expect(await app.coordinator.getSchedule(task.id)).toMatchObject({
        reminderScheduleStatus: 'notScheduled',
        reminderScheduleError: 'reminder-in-past',
      });
      expect(await app.coordinator.getDisplayState(task)).toEqual({ kind: 'inPast' });
    });

    it('does not create a notification for a Future task', async () => {
      const task = unwrap(
        await app.service.createFutureTask({
          title: 'Someday',
          reminder: { type: 'dayPeriod', period: 'evening' },
        }),
      );

      expect(app.adapter.scheduled.size).toBe(0);
      expect(await app.coordinator.getSchedule(task.id)).toBeNull();
      expect(app.adapter.calls.request).toBe(0);
    });

    it('records a failure without losing the task and recovers on reconcile', async () => {
      app.adapter.failNextSchedule('Native scheduler crashed');

      const task = await create();

      expect(unwrap(await app.service.getTask(task.id)).reminder).not.toBeNull();
      expect(await app.coordinator.getSchedule(task.id)).toMatchObject({
        reminderScheduleStatus: 'failed',
        reminderScheduleError: 'Native scheduler crashed',
        scheduledNotificationId: null,
      });
      expect(await app.coordinator.getDisplayState(task)).toEqual({ kind: 'failed' });

      await app.coordinator.reconcile();

      expect(scheduledFor(task.id)).toBeDefined();
      expect(await app.coordinator.getSchedule(task.id)).toMatchObject({
        reminderScheduleStatus: 'scheduled',
      });
    });
  });

  describe('permissions', () => {
    beforeEach(() => {
      app = createTestReminders(db, { permission: UNDETERMINED, requestResult: GRANTED });
    });

    it('asks for permission when the first reminder is saved, not at startup', async () => {
      await app.coordinator.refresh();
      await create({ reminder: null });

      expect(app.adapter.calls.request).toBe(0);

      const task = await create({ priority: 6 });

      expect(app.adapter.calls.request).toBe(1);
      expect(scheduledFor(task.id)).toBeDefined();
    });

    it('saves the task and reminder but marks permissionDenied when the user declines', async () => {
      app.adapter.setRequestResult(DENIED);

      const task = await create();

      expect(unwrap(await app.service.getTask(task.id)).reminder).toEqual({
        type: 'exact',
        localDateTime: '2026-09-11T19:30',
        timeZone: 'Europe/Berlin',
      });
      expect(app.adapter.scheduled.size).toBe(0);
      expect(await app.coordinator.getSchedule(task.id)).toMatchObject({
        reminderScheduleStatus: 'permissionDenied',
        scheduledNotificationId: null,
      });
      expect(await app.coordinator.getDisplayState(task)).toEqual({ kind: 'permissionDenied' });
    });

    it('schedules pending reminders once permission is granted later', async () => {
      app.adapter.setRequestResult(DENIED);
      const task = await create();

      app.adapter.setPermission(GRANTED);
      await app.coordinator.refresh();

      expect(scheduledFor(task.id)).toBeDefined();
      expect(await app.coordinator.getSchedule(task.id)).toMatchObject({
        reminderScheduleStatus: 'scheduled',
      });
    });
  });

  describe('task lifecycle', () => {
    it('cancels the old notification when the reminder changes', async () => {
      const task = await create();

      unwrap(
        await app.service.updateTask(task.id, {
          reminder: { type: 'exact', localDateTime: '2026-09-11T20:45' },
        }),
      );

      expect(app.adapter.calls.cancel).toContain(`task-reminder-${task.id}`);
      expect(app.adapter.scheduled.size).toBe(1);
      expect(scheduledFor(task.id)?.fireAt).toEqual(new Date('2026-09-11T18:45:00.000Z'));
    });

    it('cancels the notification on Done and restores it on Undo', async () => {
      const task = await create();

      const { event } = unwrap(await app.service.completeTask(task.id));

      expect(scheduledFor(task.id)).toBeUndefined();
      expect(await app.coordinator.getSchedule(task.id)).toBeNull();

      unwrap(await app.service.undo(event.id));

      expect(scheduledFor(task.id)?.fireAt).toEqual(new Date('2026-09-11T17:30:00.000Z'));
    });

    it('moves and reschedules the reminder on Not tonight', async () => {
      const exact = await create();
      const period = await create({
        title: 'Gym',
        priority: 6,
        reminder: { type: 'dayPeriod', period: 'night' },
      });

      unwrap(await app.service.postponeUntilTomorrow(exact.id));
      unwrap(await app.service.postponeUntilTomorrow(period.id));

      expect(scheduledFor(exact.id)).toMatchObject({
        fireAt: new Date('2026-09-12T17:30:00.000Z'),
        data: { scheduledDate: TOMORROW },
      });
      expect(scheduledFor(period.id)?.fireAt).toEqual(new Date('2026-09-12T19:00:00.000Z'));
      expect(app.adapter.scheduled.size).toBe(2);
    });

    it('cancels the notification when the task is deleted', async () => {
      const task = await create();

      unwrap(await app.service.deleteTask(task.id));

      expect(scheduledFor(task.id)).toBeUndefined();
      expect(await app.coordinator.getSchedule(task.id)).toBeNull();
    });

    it('clears and cancels the reminder when the task moves to Future', async () => {
      const task = await create();

      unwrap(await app.service.moveTaskToFuture(task.id, { clearReminder: true }));

      expect(unwrap(await app.service.getTask(task.id))).toMatchObject({
        scheduledDate: null,
        reminder: null,
      });
      expect(scheduledFor(task.id)).toBeUndefined();
      expect(await app.coordinator.getSchedule(task.id)).toBeNull();
    });

    it('reschedules after a manual date change and a title change', async () => {
      const task = await create({ reminder: { type: 'dayPeriod', period: 'evening' } });

      unwrap(
        await app.service.editTask(task.id, {
          title: 'Dentist appointment',
          placement: { kind: 'ranked', scheduledDate: TOMORROW, priority: 3 },
        }),
      );

      expect(scheduledFor(task.id)).toMatchObject({
        body: 'Dentist appointment',
        fireAt: new Date('2026-09-12T16:00:00.000Z'),
      });
      expect(app.adapter.scheduled.size).toBe(1);
    });

    it('is idempotent when a task is synced repeatedly', async () => {
      const task = await create();
      const scheduleCalls = app.adapter.calls.schedule.length;

      await app.coordinator.syncTask(task.id);
      await app.coordinator.syncTask(task.id);

      expect(app.adapter.calls.schedule.length).toBe(scheduleCalls);
      expect(app.adapter.scheduled.size).toBe(1);
    });
  });

  describe('reconcile', () => {
    it('recreates notifications that the OS lost', async () => {
      const task = await create();
      app.adapter.loseAllScheduled();

      await app.coordinator.reconcile();

      expect(scheduledFor(task.id)?.fireAt).toEqual(new Date('2026-09-11T17:30:00.000Z'));
    });

    it('cancels orphaned app notifications but keeps notifications of other features', async () => {
      const task = await create();
      const orphan = scheduledFor(task.id);
      await db.run('UPDATE tasks SET deleted_at = ? WHERE id = ?', [
        '2026-09-11T09:00:00Z',
        task.id,
      ]);
      app.adapter.foreign.push({ identifier: 'marketing-1', data: { kind: 'something-else' } });
      app.adapter.foreign.push({ identifier: 'no-data', data: {} });

      await app.coordinator.reconcile();

      expect(orphan).toBeDefined();
      expect(app.adapter.calls.cancel).toContain(`task-reminder-${task.id}`);
      expect(app.adapter.scheduled.size).toBe(0);
      expect(app.adapter.foreign.map((item) => item.identifier)).toEqual([
        'marketing-1',
        'no-data',
      ]);
      expect(await app.coordinator.getSchedule(task.id)).toBeNull();
    });

    it('does not create duplicates when run repeatedly', async () => {
      await create();
      await create({ title: 'Gym', priority: 6, reminder: { type: 'dayPeriod', period: 'night' } });
      const scheduleCalls = app.adapter.calls.schedule.length;

      await app.coordinator.reconcile();
      await app.coordinator.reconcile();
      await app.coordinator.refresh();

      expect(app.adapter.calls.schedule.length).toBe(scheduleCalls);
      expect(app.adapter.scheduled.size).toBe(2);
    });

    it('replaces a stale notification whose time no longer matches SQLite', async () => {
      const task = await create();
      await db.run(`UPDATE tasks SET reminder_local_date_time = '2026-09-11T21:00' WHERE id = ?`, [
        task.id,
      ]);

      await app.coordinator.reconcile();

      expect(scheduledFor(task.id)?.fireAt).toEqual(new Date('2026-09-11T19:00:00.000Z'));
      expect(app.adapter.scheduled.size).toBe(1);
    });
  });

  describe('settings and time zone', () => {
    it('reschedules day-period reminders when the period time changes', async () => {
      const evening = await create({ reminder: { type: 'dayPeriod', period: 'evening' } });
      const exact = await create({ title: 'Exact', priority: 6 });

      await app.coordinator.setDayPeriodTime('evening', '20:30');

      expect(scheduledFor(evening.id)?.fireAt).toEqual(new Date('2026-09-11T18:30:00.000Z'));
      expect(scheduledFor(exact.id)?.fireAt).toEqual(new Date('2026-09-11T17:30:00.000Z'));
      expect(app.adapter.scheduled.size).toBe(2);
      expect(await app.coordinator.getDayPeriodTimes()).toMatchObject({ evening: '20:30' });
    });

    it('keeps local reminder times when the device time zone changes', async () => {
      await app.coordinator.refresh();
      const task = await create();

      app.setTimeZone('America/New_York');
      await app.coordinator.refresh();

      expect(unwrap(await app.service.getTask(task.id)).reminder).toEqual({
        type: 'exact',
        localDateTime: '2026-09-11T19:30',
        timeZone: 'America/New_York',
      });
      expect(scheduledFor(task.id)?.fireAt).toEqual(new Date('2026-09-11T23:30:00.000Z'));
      expect(app.adapter.scheduled.size).toBe(1);
    });
  });
});
