import { describeEventError, type CalendarEventService } from '@/entities/calendar-event';
import type { ListService } from '@/entities/list';
import {
  describeTaskError,
  formatTaskDate,
  type ReminderInput,
  type TaskError,
  type TaskService,
} from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';

import type { VoiceSaveInput } from './voice-save-input';

export type VoiceDestination =
  | { screen: 'list'; listId: string }
  | { screen: 'future' }
  | { screen: 'matches'; date: string }
  | { screen: 'calendar'; date: string };

export type VoiceUndo =
  | { kind: 'listItem'; id: string }
  | { kind: 'list'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'calendarEvent'; id: string };

export type VoiceExecutionSuccess = {
  ok: true;
  entityId: string;
  message: string;
  destination: VoiceDestination;
  undo: VoiceUndo | null;
};

export type VoicePriorityConflict = {
  date: string;
  priority: number;
  occupiedBy: { id: string; title: string };
  freePriorities: number[];
};

export type VoiceExecutionFailure = {
  ok: false;
  reason: 'invalid' | 'priorityConflict' | 'notFound' | 'storage';
  message: string;
  fields: Partial<Record<string, string>>;
  conflict: VoicePriorityConflict | null;
};

export type VoiceExecutionResult = VoiceExecutionSuccess | VoiceExecutionFailure;

export type VoiceCommandExecutor = {
  execute(commandId: string, input: VoiceSaveInput): Promise<VoiceExecutionResult>;
  undo(undo: VoiceUndo): Promise<boolean>;
};

export type VoiceCommandExecutorDeps = {
  tasks: TaskService;
  events: CalendarEventService;
  lists: ListService;
};

export const VOICE_EXECUTION_MESSAGES = {
  storage: 'Could not save. Nothing was changed.',
  chooseList: 'Choose a list',
} as const;

function failure(
  reason: VoiceExecutionFailure['reason'],
  message: string,
  fields: Partial<Record<string, string>> = {},
  conflict: VoicePriorityConflict | null = null,
): VoiceExecutionFailure {
  return { ok: false, reason, message, fields, conflict };
}

function toReminderInput(
  reminder: Extract<VoiceSaveInput, { kind: 'rankedTask' }>['reminder'],
): ReminderInput | null {
  if (reminder === null) {
    return null;
  }
  return reminder.type === 'exact'
    ? { type: 'exact', localDateTime: reminder.localDateTime }
    : { type: 'dayPeriod', period: reminder.period };
}

export function createVoiceCommandExecutor({
  tasks,
  events,
  lists,
}: VoiceCommandExecutorDeps): VoiceCommandExecutor {
  const executions = new Map<string, Promise<VoiceExecutionResult>>();

  async function taskFailure(error: TaskError): Promise<VoiceExecutionFailure> {
    if (error.type === 'PriorityConflict') {
      const slots = await tasks.getPriorityAvailability(error.scheduledDate);
      return failure(
        'priorityConflict',
        error.message,
        { priority: error.message },
        {
          date: error.scheduledDate,
          priority: error.priority,
          occupiedBy: error.occupiedBy,
          freePriorities: slots
            .filter((slot) => slot.occupiedBy === null)
            .map((slot) => slot.priority),
        },
      );
    }
    if (error.type === 'ValidationError') {
      const fields: Partial<Record<string, string>> = {};
      for (const issue of error.issues) {
        fields[issue.field] ??= issue.message;
      }
      return failure('invalid', describeTaskError(error), fields);
    }
    return failure('notFound', describeTaskError(error));
  }

  async function run(input: VoiceSaveInput): Promise<VoiceExecutionResult> {
    switch (input.kind) {
      case 'listItem': {
        const list = await lists.getList(input.listId);
        if (!list.ok) {
          return failure('notFound', list.error.message, { targetList: list.error.message });
        }
        const result = await lists.addItem(input.listId, {
          title: input.title,
          quantity: input.quantity,
          unit: input.unit,
        });
        if (!result.ok) {
          const fields: Partial<Record<string, string>> = {};
          if (result.error.type === 'ValidationError') {
            for (const issue of result.error.issues) {
              fields[issue.field] ??= issue.message;
            }
          }
          return failure('invalid', result.error.message, fields);
        }
        return {
          ok: true,
          entityId: result.value.id,
          message: `Added to ${list.value.title}: ${result.value.title}`,
          destination: { screen: 'list', listId: input.listId },
          undo: { kind: 'listItem', id: result.value.id },
        };
      }
      case 'newListItem': {
        const result = await lists.createListWithItem(
          { title: input.listTitle },
          { title: input.title, quantity: input.quantity, unit: input.unit },
        );
        if (!result.ok) {
          return failure('invalid', result.error.message);
        }
        return {
          ok: true,
          entityId: result.value.item.id,
          message: `Created ${result.value.list.title} and added ${result.value.item.title}`,
          destination: { screen: 'list', listId: result.value.list.id },
          undo: { kind: 'list', id: result.value.list.id },
        };
      }
      case 'futureTask': {
        const result = await tasks.createFutureTask({
          title: input.title,
          exactTime: input.exactTime,
          dayPeriod: input.dayPeriod,
          reminder: toReminderInput(input.reminder),
        });
        if (!result.ok) {
          return taskFailure(result.error);
        }
        return {
          ok: true,
          entityId: result.value.id,
          message: `Added to Future: ${result.value.title}`,
          destination: { screen: 'future' },
          undo: { kind: 'task', id: result.value.id },
        };
      }
      case 'rankedTask': {
        const result = await tasks.createTask({
          title: input.title,
          scheduledDate: input.date ?? '',
          priority: input.priority,
          exactTime: input.exactTime,
          dayPeriod: input.dayPeriod,
          reminder: toReminderInput(input.reminder),
        });
        if (!result.ok) {
          return taskFailure(result.error);
        }
        return {
          ok: true,
          entityId: result.value.id,
          message: `Added to ${UI_STRINGS.todayList} for ${formatTaskDate(result.value.scheduledDate)}: ${result.value.title}`,
          destination: { screen: 'matches', date: result.value.scheduledDate },
          undo: { kind: 'task', id: result.value.id },
        };
      }
      case 'calendarEvent': {
        const startDate = input.start?.slice(0, 10) ?? '';
        const result = await events.createEvent({
          title: input.title,
          timing: input.allDay
            ? { allDay: true, startDate, endDate: input.end?.slice(0, 10) ?? startDate }
            : { allDay: false, start: input.start ?? '', end: input.end ?? '' },
          reminder: input.reminder === null ? null : { localDateTime: input.reminder },
        });
        if (!result.ok) {
          const fields: Partial<Record<string, string>> = {};
          if (result.error.type === 'ValidationError') {
            for (const issue of result.error.issues) {
              fields[issue.field] ??= issue.message;
            }
          }
          return failure('invalid', describeEventError(result.error), fields);
        }
        return {
          ok: true,
          entityId: result.value.id,
          message: `Added to Calendar: ${result.value.title}`,
          destination: { screen: 'calendar', date: startDate },
          undo: { kind: 'calendarEvent', id: result.value.id },
        };
      }
    }
  }

  return {
    execute(commandId, input) {
      const existing = executions.get(commandId);
      if (existing !== undefined) {
        return existing;
      }
      const pending = run(input)
        .catch(() => failure('storage', VOICE_EXECUTION_MESSAGES.storage))
        .then((result) => {
          if (!result.ok) {
            executions.delete(commandId);
          }
          return result;
        });
      executions.set(commandId, pending);
      return pending;
    },

    async undo(undo) {
      try {
        switch (undo.kind) {
          case 'listItem':
            return (await lists.deleteItem(undo.id)).ok;
          case 'list':
            return (await lists.deleteList(undo.id)).ok;
          case 'task':
            return (await tasks.deleteTask(undo.id)).ok;
          case 'calendarEvent':
            return (await events.deleteEvent(undo.id)).ok;
        }
      } catch {
        return false;
      }
    },
  };
}
