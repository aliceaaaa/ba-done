import type { SqlDatabase } from '@/database/sql-database';
import {
  createNotificationResponseRepository,
  parseReminderPayload,
  taskDetailsPath,
} from '@/entities/reminder';
import type { TaskService } from '@/entities/task';

import { REMINDER_ACTIONS, type NotificationResponseInput } from './notification-adapter';

export type ResponseOutcome =
  | { kind: 'duplicate' }
  | { kind: 'ignored' }
  | { kind: 'taskMissing' }
  | { kind: 'alreadyHandled'; taskId: string }
  | { kind: 'completed'; taskId: string }
  | { kind: 'postponed'; taskId: string }
  | { kind: 'navigate'; path: string };

export type NotificationResponseHandler = {
  handle(response: NotificationResponseInput): Promise<ResponseOutcome>;
};

export type NotificationResponseHandlerDeps = {
  db: SqlDatabase;
  service: TaskService;
  now: () => Date;
};

export function remindLaterPath(taskId: string): string {
  return `/task/${taskId}/remind-later`;
}

export function changePriorityPath(taskId: string): string {
  return `/task/${taskId}/priority`;
}

export function createNotificationResponseHandler({
  db,
  service,
  now,
}: NotificationResponseHandlerDeps): NotificationResponseHandler {
  const responses = createNotificationResponseRepository(db);
  const inFlight = new Map<string, Promise<ResponseOutcome>>();

  async function process(response: NotificationResponseInput): Promise<ResponseOutcome> {
    if (await responses.has(response.responseId)) {
      return { kind: 'duplicate' };
    }
    const payload = parseReminderPayload(response.data);
    const record = (taskId: string | null) =>
      responses.record(response.responseId, response.actionIdentifier, taskId, now().toISOString());
    if (payload === null) {
      await record(null);
      return { kind: 'ignored' };
    }
    const loaded = await service.getTask(payload.taskId);
    if (!loaded.ok) {
      await record(payload.taskId);
      return { kind: 'taskMissing' };
    }
    const task = loaded.value;
    const outcome = await (async (): Promise<ResponseOutcome> => {
      switch (response.actionIdentifier) {
        case REMINDER_ACTIONS.done: {
          if (task.status === 'completed') {
            return { kind: 'alreadyHandled', taskId: task.id };
          }
          const result = await service.completeTask(task.id);
          return result.ok
            ? { kind: 'completed', taskId: task.id }
            : { kind: 'navigate', path: taskDetailsPath(task.id) };
        }
        case REMINDER_ACTIONS.notTonight: {
          if (task.status === 'completed' || task.scheduledDate !== payload.scheduledDate) {
            return { kind: 'alreadyHandled', taskId: task.id };
          }
          const result = await service.postponeUntilTomorrow(task.id);
          return result.ok
            ? { kind: 'postponed', taskId: task.id }
            : { kind: 'navigate', path: taskDetailsPath(task.id) };
        }
        case REMINDER_ACTIONS.remindLater:
          return {
            kind: 'navigate',
            path: task.status === 'active' ? remindLaterPath(task.id) : taskDetailsPath(task.id),
          };
        case REMINDER_ACTIONS.changePriority:
          return {
            kind: 'navigate',
            path: task.status === 'active' ? changePriorityPath(task.id) : taskDetailsPath(task.id),
          };
        default:
          return { kind: 'navigate', path: taskDetailsPath(task.id) };
      }
    })();
    await record(task.id);
    return outcome;
  }

  return {
    handle(response) {
      const pending = inFlight.get(response.responseId);
      if (pending !== undefined) {
        return pending.then(() => ({ kind: 'duplicate' }));
      }
      const next = process(response).finally(() => {
        inFlight.delete(response.responseId);
      });
      inFlight.set(response.responseId, next);
      return next;
    },
  };
}
