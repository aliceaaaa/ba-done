import type { SqlDatabase, SqlExecutor } from '@/database/sql-database';
import { addDays, toLocalDate } from '@/shared/lib/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import { createTaskEventRepository, type TaskEventRepository } from '../api/task-event-repository';
import {
  createTaskRepository,
  isRankedPriorityUniqueViolation,
  type TaskRepository,
} from '../api/task-repository';
import { compareDeckPositions, toDeckPosition } from './deck-position';
import {
  invalidTaskState,
  priorityConflict,
  swapNotAllowed,
  taskNotFound,
  undoNotAvailable,
  type InvalidTaskState,
  type PriorityConflict,
  type TaskAction,
  type TaskError,
} from './task-errors';
import { validateDetails, validateRankedSlot } from './task-validation';
import {
  FUTURE_PLACEMENT,
  PRIORITY_MAX,
  PRIORITY_MIN,
  isFutureTask,
  isScheduledTask,
  type CarryOverTask,
  type CompletedEvent,
  type CreateFutureTaskInput,
  type CreateTaskInput,
  type DeckPosition,
  type FutureTask,
  type PostponedEvent,
  type PrioritySlot,
  type RankedSlot,
  type RankedTask,
  type ReminderInput,
  type ScheduledTask,
  type Task,
  type TaskDetails,
  type TaskDetailsInput,
  type TaskEvent,
  type TaskReminder,
  type UpdateTaskInput,
} from './types';

export type TaskServiceDeps = {
  db: SqlDatabase;
  now: () => Date;
  generateId: () => string;
  timeZone: () => string;
};

export type TaskResult<T> = Result<T, TaskError>;

export type SwappedTasks = {
  first: RankedTask;
  second: RankedTask;
};

export type PostponeResult = {
  task: CarryOverTask;
  event: PostponedEvent;
};

export type CompleteResult = {
  task: Task;
  event: CompletedEvent;
};

export type TaskService = {
  getToday(): string;
  getTask(id: string): Promise<TaskResult<Task>>;
  getDeck(scheduledDate: string): Promise<ScheduledTask[]>;
  getFuturePool(): Promise<FutureTask[]>;
  getHistory(id: string): Promise<TaskEvent[]>;
  getPriorityAvailability(scheduledDate: string): Promise<PrioritySlot[]>;
  createTask(input: CreateTaskInput): Promise<TaskResult<RankedTask>>;
  createFutureTask(input: CreateFutureTaskInput): Promise<TaskResult<FutureTask>>;
  updateTask(id: string, patch: UpdateTaskInput): Promise<TaskResult<Task>>;
  changePriority(id: string, priority: number): Promise<TaskResult<RankedTask>>;
  swapPriorities(firstId: string, secondId: string): Promise<TaskResult<SwappedTasks>>;
  completeTask(id: string): Promise<TaskResult<CompleteResult>>;
  postponeUntilTomorrow(id: string): Promise<TaskResult<PostponeResult>>;
  rescheduleTask(id: string, slot: RankedSlot): Promise<TaskResult<RankedTask>>;
  scheduleFutureTask(id: string, slot: RankedSlot): Promise<TaskResult<RankedTask>>;
  undo(eventId: string): Promise<TaskResult<Task>>;
};

type Repositories = {
  tasks: TaskRepository;
  events: TaskEventRepository;
};

type CarryOverArrival = {
  fromDate: string;
  toDate: string;
  from: DeckPosition;
};

const PRIORITIES_DESCENDING = Array.from(
  { length: PRIORITY_MAX - PRIORITY_MIN + 1 },
  (_, index) => PRIORITY_MAX - index,
);

class TransactionAborted extends Error {
  constructor(readonly taskError: TaskError) {
    super(taskError.message);
    this.name = 'TransactionAborted';
  }
}

function createRepositories(db: SqlExecutor): Repositories {
  return { tasks: createTaskRepository(db), events: createTaskEventRepository(db) };
}

function resolveReminder(input: ReminderInput | null, timeZone: string): TaskReminder | null {
  if (input === null) {
    return null;
  }
  return input.type === 'exact'
    ? { type: 'exact', localDateTime: input.localDateTime, timeZone }
    : { type: 'dayPeriod', period: input.period, timeZone };
}

function detailsFromInput(title: string, input: TaskDetailsInput, timeZone: string): TaskDetails {
  return {
    title,
    description: input.description ?? null,
    exactTime: input.exactTime ?? null,
    dayPeriod: input.dayPeriod ?? null,
    durationMinutes: input.durationMinutes ?? null,
    address: input.address ?? null,
    travelMinutes: input.travelMinutes ?? null,
    thingsToTake: input.thingsToTake ?? [],
    reminder: resolveReminder(input.reminder ?? null, timeZone),
  };
}

function detailsFromTask(task: Task): TaskDetails {
  return {
    title: task.title,
    description: task.description,
    exactTime: task.exactTime,
    dayPeriod: task.dayPeriod,
    durationMinutes: task.durationMinutes,
    address: task.address,
    travelMinutes: task.travelMinutes,
    thingsToTake: task.thingsToTake,
    reminder: task.reminder,
  };
}

function toRanked(task: Task, slot: RankedSlot, updatedAt: string): RankedTask {
  return {
    ...task,
    scheduledDate: slot.scheduledDate,
    placementType: 'ranked',
    priority: slot.priority,
    carryOverOrder: null,
    updatedAt,
  };
}

function completedGuard(task: Task, action: TaskAction): InvalidTaskState | null {
  return task.status === 'completed' ? invalidTaskState(task.id, action, 'completed') : null;
}

function restoreFromEvent(task: Task, event: TaskEvent, fallbackUpdatedAt: string): Task | null {
  const updatedAt = event.previousUpdatedAt ?? fallbackUpdatedAt;
  if (event.type === 'completed') {
    return task.status === 'completed'
      ? { ...task, status: 'active', completedAt: null, updatedAt }
      : null;
  }
  const isWhereEventLeftIt =
    task.status === 'active' &&
    task.placementType === 'carryOver' &&
    task.scheduledDate === event.toDate;
  return isWhereEventLeftIt
    ? { ...task, scheduledDate: event.fromDate, ...event.from, updatedAt }
    : null;
}

async function findConflict(
  tasks: TaskRepository,
  slot: RankedSlot,
  selfId: string | null,
): Promise<PriorityConflict | null> {
  const occupant = await tasks.findActiveRanked(slot.scheduledDate, slot.priority);
  return occupant === null || occupant.id === selfId ? null : priorityConflict(occupant);
}

async function writeRanked(
  tasks: TaskRepository,
  task: RankedTask,
  write: (task: Task) => Promise<void>,
): Promise<TaskResult<RankedTask>> {
  try {
    await write(task);
    return ok(task);
  } catch (error) {
    if (!isRankedPriorityUniqueViolation(error)) {
      throw error;
    }
    const conflict = await findConflict(tasks, task, task.id);
    if (conflict === null) {
      throw error;
    }
    return err(conflict);
  }
}

async function makeRoomForCarryOver(
  tasks: TaskRepository,
  scheduledDate: string,
  carryOverOrder: number,
): Promise<void> {
  const carryOvers = await tasks.listActiveCarryOvers(scheduledDate);
  if (!carryOvers.some((task) => task.carryOverOrder === carryOverOrder)) {
    return;
  }
  const shifted = carryOvers.filter((task) => task.carryOverOrder >= carryOverOrder).reverse();
  for (const task of shifted) {
    await tasks.setCarryOverOrder(task.id, task.carryOverOrder + 1);
  }
}

async function reserveCarryOverOrder(
  { tasks, events }: Repositories,
  arrival: CarryOverArrival,
): Promise<number> {
  const carryOvers = await tasks.listActiveCarryOvers(arrival.toDate);
  for (const existing of carryOvers) {
    const previous = await events.findLatestArrival(existing.id, arrival.toDate);
    const comesLater =
      previous !== null &&
      previous.fromDate === arrival.fromDate &&
      compareDeckPositions(previous.from, arrival.from) > 0;
    if (comesLater) {
      await makeRoomForCarryOver(tasks, arrival.toDate, existing.carryOverOrder);
      return existing.carryOverOrder;
    }
  }
  const last = carryOvers[carryOvers.length - 1];
  return (last?.carryOverOrder ?? 0) + 1;
}

async function writeRestored(repos: Repositories, task: Task): Promise<TaskResult<Task>> {
  if (task.status === 'active' && task.placementType === 'ranked') {
    const conflict = await findConflict(repos.tasks, task, task.id);
    if (conflict !== null) {
      return err(conflict);
    }
    return writeRanked(repos.tasks, task, repos.tasks.update);
  }
  if (task.status === 'active' && task.placementType === 'carryOver') {
    await makeRoomForCarryOver(repos.tasks, task.scheduledDate, task.carryOverOrder);
  }
  await repos.tasks.update(task);
  return ok(task);
}

export function createTaskService({
  db,
  now,
  generateId,
  timeZone,
}: TaskServiceDeps): TaskService {
  const timestamp = () => now().toISOString();

  async function inTransaction<T>(
    work: (repos: Repositories) => Promise<TaskResult<T>>,
  ): Promise<TaskResult<T>> {
    try {
      return await db.transaction(async (tx) => {
        const result = await work(createRepositories(tx));
        if (!result.ok) {
          throw new TransactionAborted(result.error);
        }
        return result;
      });
    } catch (error) {
      if (error instanceof TransactionAborted) {
        return err(error.taskError);
      }
      throw error;
    }
  }

  async function withTask<T>(
    repos: Repositories,
    id: string,
    work: (task: Task) => Promise<TaskResult<T>>,
  ): Promise<TaskResult<T>> {
    const task = await repos.tasks.findById(id);
    return task === null ? err(taskNotFound(id)) : work(task);
  }

  async function placeRanked(
    repos: Repositories,
    task: Task,
    requested: RankedSlot,
  ): Promise<TaskResult<RankedTask>> {
    const slot = validateRankedSlot(requested);
    if (!slot.ok) {
      return slot;
    }
    const conflict = await findConflict(repos.tasks, slot.value, task.id);
    if (conflict !== null) {
      return err(conflict);
    }
    return writeRanked(repos.tasks, toRanked(task, slot.value, timestamp()), repos.tasks.update);
  }

  return {
    getToday() {
      return toLocalDate(now(), timeZone());
    },

    async getTask(id) {
      const task = await createTaskRepository(db).findById(id);
      return task === null ? err(taskNotFound(id)) : ok(task);
    },

    getDeck(scheduledDate) {
      return createTaskRepository(db).listDeck(scheduledDate);
    },

    getFuturePool() {
      return createTaskRepository(db).listFuturePool();
    },

    getHistory(id) {
      return createTaskEventRepository(db).listByTask(id);
    },

    async getPriorityAvailability(scheduledDate) {
      const deck = await createTaskRepository(db).listDeck(scheduledDate);
      const occupants = new Map(
        deck.flatMap((task) =>
          task.placementType === 'ranked' ? [[task.priority, task] as const] : [],
        ),
      );
      return PRIORITIES_DESCENDING.map((priority) => {
        const occupant = occupants.get(priority);
        return {
          priority,
          occupiedBy: occupant === undefined ? null : { id: occupant.id, title: occupant.title },
        };
      });
    },

    createTask(input) {
      return inTransaction(async (repos) => {
        const slot = validateRankedSlot({
          scheduledDate: input.scheduledDate,
          priority: input.priority,
        });
        if (!slot.ok) {
          return slot;
        }
        const details = validateDetails(detailsFromInput(input.title, input, timeZone()));
        if (!details.ok) {
          return details;
        }
        const conflict = await findConflict(repos.tasks, slot.value, null);
        if (conflict !== null) {
          return err(conflict);
        }
        const createdAt = timestamp();
        const task: RankedTask = {
          ...details.value,
          id: generateId(),
          status: 'active',
          scheduledDate: slot.value.scheduledDate,
          placementType: 'ranked',
          priority: slot.value.priority,
          carryOverOrder: null,
          createdAt,
          updatedAt: createdAt,
          completedAt: null,
        };
        return writeRanked(repos.tasks, task, repos.tasks.insert);
      });
    },

    createFutureTask(input) {
      return inTransaction(async (repos) => {
        const details = validateDetails(detailsFromInput(input.title, input, timeZone()));
        if (!details.ok) {
          return details;
        }
        const createdAt = timestamp();
        const task: FutureTask = {
          ...details.value,
          ...FUTURE_PLACEMENT,
          id: generateId(),
          status: 'active',
          createdAt,
          updatedAt: createdAt,
          completedAt: null,
        };
        await repos.tasks.insert(task);
        return ok(task);
      });
    },

    updateTask(id, patch) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const { reminder, ...rest } = patch;
          const details = validateDetails({
            ...detailsFromTask(task),
            ...rest,
            ...(reminder === undefined ? {} : { reminder: resolveReminder(reminder, timeZone()) }),
          });
          if (!details.ok) {
            return details;
          }
          const updated: Task = { ...task, ...details.value, updatedAt: timestamp() };
          await repos.tasks.update(updated);
          return ok(updated);
        }),
      );
    },

    changePriority(id, priority) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const blocked = completedGuard(task, 'changePriority');
          if (blocked !== null) {
            return err(blocked);
          }
          if (!isScheduledTask(task)) {
            return err(invalidTaskState(task.id, 'changePriority', 'future'));
          }
          return placeRanked(repos, task, { scheduledDate: task.scheduledDate, priority });
        }),
      );
    },

    swapPriorities(firstId, secondId) {
      return inTransaction(async (repos) => {
        if (firstId === secondId) {
          return err(swapNotAllowed('same-task'));
        }
        const first = await repos.tasks.findById(firstId);
        if (first === null) {
          return err(taskNotFound(firstId));
        }
        const second = await repos.tasks.findById(secondId);
        if (second === null) {
          return err(taskNotFound(secondId));
        }
        if (
          first.status !== 'active' ||
          second.status !== 'active' ||
          first.placementType !== 'ranked' ||
          second.placementType !== 'ranked'
        ) {
          return err(swapNotAllowed('not-ranked'));
        }
        if (first.scheduledDate !== second.scheduledDate) {
          return err(swapNotAllowed('different-days'));
        }

        const updatedAt = timestamp();
        const swappedFirst = toRanked(
          first,
          { scheduledDate: first.scheduledDate, priority: second.priority },
          updatedAt,
        );
        const swappedSecond = toRanked(
          second,
          { scheduledDate: second.scheduledDate, priority: first.priority },
          updatedAt,
        );

        await repos.tasks.update({ ...first, ...FUTURE_PLACEMENT, updatedAt });
        await repos.tasks.update(swappedSecond);
        await repos.tasks.update(swappedFirst);

        return ok({ first: swappedFirst, second: swappedSecond });
      });
    },

    completeTask(id) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const blocked = completedGuard(task, 'complete');
          if (blocked !== null) {
            return err(blocked);
          }
          const completedAt = timestamp();
          const completed: Task = {
            ...task,
            status: 'completed',
            completedAt,
            updatedAt: completedAt,
          };
          const event: CompletedEvent = {
            id: generateId(),
            taskId: task.id,
            type: 'completed',
            scheduledDate: task.scheduledDate,
            previousUpdatedAt: task.updatedAt,
            occurredAt: completedAt,
          };
          await repos.tasks.update(completed);
          await repos.events.insert(event);
          return ok({ task: completed, event });
        }),
      );
    },

    postponeUntilTomorrow(id) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const blocked = completedGuard(task, 'postpone');
          if (blocked !== null) {
            return err(blocked);
          }
          if (!isScheduledTask(task)) {
            return err(invalidTaskState(task.id, 'postpone', 'future'));
          }

          const instant = now();
          const today = toLocalDate(instant, timeZone());
          const fromDate = task.scheduledDate;
          const toDate = addDays(fromDate > today ? fromDate : today, 1);
          const from = toDeckPosition(task);
          const carryOverOrder = await reserveCarryOverOrder(repos, { fromDate, toDate, from });
          const occurredAt = instant.toISOString();

          const postponed: CarryOverTask = {
            ...task,
            scheduledDate: toDate,
            placementType: 'carryOver',
            priority: null,
            carryOverOrder,
            updatedAt: occurredAt,
          };
          const event: PostponedEvent = {
            id: generateId(),
            taskId: task.id,
            type: 'postponed',
            fromDate,
            toDate,
            from,
            previousUpdatedAt: task.updatedAt,
            occurredAt,
          };

          await repos.tasks.update(postponed);
          await repos.events.insert(event);
          return ok({ task: postponed, event });
        }),
      );
    },

    rescheduleTask(id, slot) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const blocked = completedGuard(task, 'reschedule');
          if (blocked !== null) {
            return err(blocked);
          }
          if (!isScheduledTask(task)) {
            return err(invalidTaskState(task.id, 'reschedule', 'future'));
          }
          return placeRanked(repos, task, slot);
        }),
      );
    },

    scheduleFutureTask(id, slot) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const blocked = completedGuard(task, 'schedule');
          if (blocked !== null) {
            return err(blocked);
          }
          if (!isFutureTask(task)) {
            return err(invalidTaskState(task.id, 'schedule', 'scheduled'));
          }
          return placeRanked(repos, task, slot);
        }),
      );
    },

    undo(eventId) {
      return inTransaction(async (repos) => {
        const event = await repos.events.findById(eventId);
        if (event === null) {
          return err(undoNotAvailable(eventId, 'not-found'));
        }
        const latest = await repos.events.findLatestForTask(event.taskId);
        if (latest?.id !== event.id) {
          return err(undoNotAvailable(eventId, 'superseded'));
        }
        return withTask(repos, event.taskId, async (task) => {
          const restored = restoreFromEvent(task, event, timestamp());
          if (restored === null) {
            return err(undoNotAvailable(eventId, 'state-changed'));
          }
          const written = await writeRestored(repos, restored);
          if (!written.ok) {
            return written;
          }
          await repos.events.delete(event.id);
          return written;
        });
      });
    },
  };
}
