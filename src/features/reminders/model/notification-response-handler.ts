import type { SqlDatabase } from '@/database/sql-database';
import type { CalendarEventService } from '@/entities/calendar-event';
import {
  createNotificationResponseRepository,
  eventDetailsPath,
  parseEventReminderPayload,
  parseReminderPayload,
  taskDetailsPath,
  type EventReminderPayload,
  type ReminderOwner,
  type ReminderPayload,
} from '@/entities/reminder';
import type { TaskService } from '@/entities/task';

import { REMINDER_ACTIONS, type NotificationResponseInput } from './notification-adapter';

export type ResponseOutcome =
  | { kind: 'duplicate' }
  | { kind: 'ignored' }
  | { kind: 'taskMissing' }
  | { kind: 'eventMissing' }
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
  events: CalendarEventService;
  now: () => Date;
};

export function remindLaterPath(taskId: string): string {
  return `/task/${taskId}/remind-later`;
}

export function eventRemindLaterPath(eventId: string): string {
  return `/event/${eventId}/remind-later`;
}

export function changePriorityPath(taskId: string): string {
  return `/task/${taskId}/priority`;
}

type HandledOutcome = {
  owner: ReminderOwner | null;
  outcome: ResponseOutcome;
};

export function createNotificationResponseHandler({
  db,
  service,
  events,
  now,
}: NotificationResponseHandlerDeps): NotificationResponseHandler {
  const responses = createNotificationResponseRepository(db);
  const inFlight = new Map<string, Promise<ResponseOutcome>>();

  async function handleTask(
    payload: ReminderPayload,
    actionIdentifier: string,
  ): Promise<HandledOutcome> {
    const owner: ReminderOwner = { ownerType: 'task', ownerId: payload.taskId };
    const loaded = await service.getTask(payload.taskId);
    if (!loaded.ok) {
      return { owner, outcome: { kind: 'taskMissing' } };
    }
    const task = loaded.value;
    switch (actionIdentifier) {
      case REMINDER_ACTIONS.done: {
        if (task.status === 'completed') {
          return { owner, outcome: { kind: 'alreadyHandled', taskId: task.id } };
        }
        const result = await service.completeTask(task.id);
        return {
          owner,
          outcome: result.ok
            ? { kind: 'completed', taskId: task.id }
            : { kind: 'navigate', path: taskDetailsPath(task.id) },
        };
      }
      case REMINDER_ACTIONS.notTonight: {
        if (task.status === 'completed' || task.scheduledDate !== payload.scheduledDate) {
          return { owner, outcome: { kind: 'alreadyHandled', taskId: task.id } };
        }
        const result = await service.postponeUntilTomorrow(task.id);
        return {
          owner,
          outcome: result.ok
            ? { kind: 'postponed', taskId: task.id }
            : { kind: 'navigate', path: taskDetailsPath(task.id) },
        };
      }
      case REMINDER_ACTIONS.remindLater:
        return {
          owner,
          outcome: {
            kind: 'navigate',
            path: task.status === 'active' ? remindLaterPath(task.id) : taskDetailsPath(task.id),
          },
        };
      case REMINDER_ACTIONS.changePriority:
        return {
          owner,
          outcome: {
            kind: 'navigate',
            path: task.status === 'active' ? changePriorityPath(task.id) : taskDetailsPath(task.id),
          },
        };
      default:
        return { owner, outcome: { kind: 'navigate', path: taskDetailsPath(task.id) } };
    }
  }

  async function handleEvent(
    payload: EventReminderPayload,
    actionIdentifier: string,
  ): Promise<HandledOutcome> {
    const owner: ReminderOwner = { ownerType: 'calendarEvent', ownerId: payload.eventId };
    const loaded = await events.getEvent(payload.eventId);
    if (!loaded.ok) {
      return { owner, outcome: { kind: 'eventMissing' } };
    }
    const path =
      actionIdentifier === REMINDER_ACTIONS.remindLater
        ? eventRemindLaterPath(payload.eventId)
        : eventDetailsPath(payload.eventId);
    return { owner, outcome: { kind: 'navigate', path } };
  }

  async function process(response: NotificationResponseInput): Promise<ResponseOutcome> {
    if (await responses.has(response.responseId)) {
      return { kind: 'duplicate' };
    }
    const taskPayload = parseReminderPayload(response.data);
    const eventPayload = taskPayload === null ? parseEventReminderPayload(response.data) : null;
    const handled: HandledOutcome =
      taskPayload !== null
        ? await handleTask(taskPayload, response.actionIdentifier)
        : eventPayload !== null
          ? await handleEvent(eventPayload, response.actionIdentifier)
          : { owner: null, outcome: { kind: 'ignored' } };
    await responses.record(
      response.responseId,
      response.actionIdentifier,
      handled.owner,
      now().toISOString(),
    );
    return handled.outcome;
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
