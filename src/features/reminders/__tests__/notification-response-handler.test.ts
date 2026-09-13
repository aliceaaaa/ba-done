import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import { reminderNotificationId } from '@/entities/reminder';
import type { RankedTask } from '@/entities/task';
import {
  TODAY,
  TOMORROW,
  createTestDatabase,
  createTestReminders,
  unwrap,
  type TestReminders,
} from '@/test-utils/test-app';

import { createNotificationResponseHandler } from '../model/notification-response-handler';
import { REMINDER_ACTIONS, type NotificationResponseInput } from '../model/notification-adapter';
import { GRANTED } from '../testing/fake-notification-adapter';

describe('NotificationResponseHandler', () => {
  let db: NodeSqliteDatabase;
  let app: TestReminders;

  async function createWithReminder(): Promise<RankedTask> {
    return unwrap(
      await app.service.createTask({
        title: 'Dentist',
        scheduledDate: TODAY,
        priority: 5,
        reminder: { type: 'exact', localDateTime: '2026-09-11T19:30' },
      }),
    );
  }

  function responseFor(task: RankedTask, actionIdentifier: string): NotificationResponseInput {
    const request = app.adapter.scheduled.get(reminderNotificationId(task.id));
    if (request === undefined) {
      throw new Error('Expected a scheduled notification');
    }
    return {
      responseId: `${request.identifier}:1789000000000:${actionIdentifier}`,
      actionIdentifier,
      data: { ...request.data },
    };
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    app = createTestReminders(db, { permission: GRANTED });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db.close();
  });

  it('opens the details of the right task when the notification is tapped', async () => {
    const task = await createWithReminder();

    expect(await app.handler.handle(responseFor(task, REMINDER_ACTIONS.open))).toEqual({
      kind: 'navigate',
      path: `/task/${task.id}`,
    });
  });

  it('completes the task through the existing TaskService on Done', async () => {
    const task = await createWithReminder();
    const response = responseFor(task, REMINDER_ACTIONS.done);
    const completeTask = jest.spyOn(app.service, 'completeTask');

    expect(await app.handler.handle(response)).toEqual({ kind: 'completed', taskId: task.id });

    expect(completeTask).toHaveBeenCalledWith(task.id);
    expect(unwrap(await app.service.getTask(task.id))).toMatchObject({ status: 'completed' });
    expect((await app.service.getHistory(task.id)).map((event) => event.type)).toEqual([
      'completed',
    ]);
    expect(app.adapter.scheduled.size).toBe(0);
  });

  it('turns the task into a Mega Crush for tomorrow on Not tonight', async () => {
    const task = await createWithReminder();

    expect(await app.handler.handle(responseFor(task, REMINDER_ACTIONS.notTonight))).toEqual({
      kind: 'postponed',
      taskId: task.id,
    });

    expect(unwrap(await app.service.getTask(task.id))).toMatchObject({
      scheduledDate: TOMORROW,
      placementType: 'carryOver',
      priority: null,
      carryOverOrder: 1,
    });
    expect(app.adapter.scheduled.get(reminderNotificationId(task.id))?.fireAt).toEqual(
      new Date('2026-09-12T17:30:00.000Z'),
    );
  });

  it('opens the Remind me later picker without moving the task', async () => {
    const task = await createWithReminder();

    expect(await app.handler.handle(responseFor(task, REMINDER_ACTIONS.remindLater))).toEqual({
      kind: 'navigate',
      path: `/task/${task.id}/remind-later`,
    });
    expect(unwrap(await app.service.getTask(task.id))).toEqual(task);
  });

  it('opens the priority picker of the right task on Change priority', async () => {
    const task = await createWithReminder();

    expect(await app.handler.handle(responseFor(task, REMINDER_ACTIONS.changePriority))).toEqual({
      kind: 'navigate',
      path: `/task/${task.id}/priority`,
    });
  });

  it('never applies the same response twice, even concurrently or after a restart', async () => {
    const task = await createWithReminder();
    const response = responseFor(task, REMINDER_ACTIONS.notTonight);
    const postpone = jest.spyOn(app.service, 'postponeUntilTomorrow');

    const [first, second] = await Promise.all([
      app.handler.handle(response),
      app.handler.handle(response),
    ]);
    const restarted = createNotificationResponseHandler({
      db,
      service: app.service,
      events: app.events,
      now: () => new Date('2026-09-11T09:00:00.000Z'),
    });

    expect([first.kind, second.kind].sort()).toEqual(['duplicate', 'postponed']);
    expect(await restarted.handle(response)).toEqual({ kind: 'duplicate' });
    expect(postpone).toHaveBeenCalledTimes(1);
    expect(unwrap(await app.service.getTask(task.id)).scheduledDate).toBe(TOMORROW);
  });

  it('treats actions on already handled tasks as no-ops', async () => {
    const task = await createWithReminder();
    const doneResponse = responseFor(task, REMINDER_ACTIONS.done);
    const notTonightResponse = responseFor(task, REMINDER_ACTIONS.notTonight);
    unwrap(await app.service.postponeUntilTomorrow(task.id));

    expect(await app.handler.handle(notTonightResponse)).toEqual({
      kind: 'alreadyHandled',
      taskId: task.id,
    });
    expect(unwrap(await app.service.getTask(task.id)).scheduledDate).toBe(TOMORROW);

    unwrap(await app.service.completeTask(task.id));
    expect(await app.handler.handle(doneResponse)).toEqual({
      kind: 'alreadyHandled',
      taskId: task.id,
    });
  });

  it('handles deleted tasks and foreign payloads safely', async () => {
    const task = await createWithReminder();
    const response = responseFor(task, REMINDER_ACTIONS.done);
    unwrap(await app.service.deleteTask(task.id));

    expect(await app.handler.handle(response)).toEqual({ kind: 'taskMissing' });
    expect(
      await app.handler.handle({
        responseId: 'foreign-1',
        actionIdentifier: REMINDER_ACTIONS.done,
        data: { taskId: 42 },
      }),
    ).toEqual({ kind: 'ignored' });
  });
});
