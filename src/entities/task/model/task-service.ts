import type { SqlDatabase, SqlExecutor } from '@/database/sql-database';
import {
  addDays,
  daysBetween,
  isValidLocalDateTime,
  isValidTimeZone,
  shiftLocalDateTime,
  toLocalDate,
  zonedDateTimeToInstant,
} from '@/shared/lib/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import { createReturnNoticeRepository } from '../api/return-notice-repository';
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
  reminderClearRequired,
  swapNotAllowed,
  taskNotFound,
  undoNotAvailable,
  validationError,
  type InvalidTaskState,
  type PriorityConflict,
  type TaskAction,
  type TaskError,
  type TaskValidationError,
  type ValidationIssue,
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
  type EditTaskInput,
  type FutureTask,
  type MoveToFutureOptions,
  type PlacementChange,
  type PostponedEvent,
  type PriorityAvailabilityOptions,
  type PrioritySlot,
  type RankedSlot,
  type RankedSlotInput,
  type RankedTask,
  type ReminderInput,
  type ScheduledTask,
  type Task,
  type TaskDetails,
  type TaskDetailsInput,
  type ReminderSnoozedEvent,
  type TaskEvent,
  type TaskReminder,
  type ThingToTake,
  type ThingToTakeInput,
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

export type SnoozeResult = {
  task: Task;
  event: ReminderSnoozedEvent;
};

export const REMINDER_IN_PAST_MESSAGE = 'Choose a reminder time in the future';

export type TaskService = {
  getToday(): string;
  getTimeZone(): string;
  getTask(id: string): Promise<TaskResult<Task>>;
  getDeck(scheduledDate: string): Promise<ScheduledTask[]>;
  getFuturePool(): Promise<FutureTask[]>;
  getHistory(id: string): Promise<TaskEvent[]>;
  claimReturnNotices(scheduledDate: string): Promise<string[]>;
  getTasksWithReminders(): Promise<Task[]>;
  snoozeReminder(id: string, localDateTime: string): Promise<TaskResult<SnoozeResult>>;
  rebaseReminderTimeZones(timeZone: string): Promise<TaskResult<string[]>>;
  onChange(listener: () => void): () => void;
  getPriorityAvailability(
    scheduledDate: string,
    options?: PriorityAvailabilityOptions,
  ): Promise<PrioritySlot[]>;
  createTask(input: CreateTaskInput): Promise<TaskResult<RankedTask>>;
  createFutureTask(input: CreateFutureTaskInput): Promise<TaskResult<FutureTask>>;
  updateTask(id: string, patch: UpdateTaskInput): Promise<TaskResult<Task>>;
  editTask(id: string, input: EditTaskInput): Promise<TaskResult<Task>>;
  changePriority(id: string, priority: number): Promise<TaskResult<RankedTask>>;
  convertCarryOverToRanked(id: string, priority: number | null): Promise<TaskResult<RankedTask>>;
  swapPriorities(firstId: string, secondId: string): Promise<TaskResult<SwappedTasks>>;
  completeTask(id: string): Promise<TaskResult<CompleteResult>>;
  postponeUntilTomorrow(id: string): Promise<TaskResult<PostponeResult>>;
  rescheduleTask(id: string, slot: RankedSlotInput): Promise<TaskResult<RankedTask>>;
  scheduleFutureTask(id: string, slot: RankedSlotInput): Promise<TaskResult<RankedTask>>;
  moveTaskToFuture(id: string, options?: MoveToFutureOptions): Promise<TaskResult<FutureTask>>;
  setThingToTakeChecked(id: string, index: number, checked: boolean): Promise<TaskResult<Task>>;
  deleteTask(id: string): Promise<TaskResult<{ id: string }>>;
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

function issuesOf(result: Result<unknown, TaskValidationError>): ValidationIssue[] {
  return result.ok ? [] : result.error.issues;
}

function resolveReminder(input: ReminderInput | null, timeZone: string): TaskReminder | null {
  if (input === null) {
    return null;
  }
  return input.type === 'exact'
    ? { type: 'exact', localDateTime: input.localDateTime, timeZone }
    : { type: 'dayPeriod', period: input.period, timeZone };
}

function normalizeThings(items: readonly ThingToTakeInput[]): ThingToTake[] {
  return items.map((item) => ({ text: item.text, checked: item.checked ?? false }));
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
    thingsToTake: normalizeThings(input.thingsToTake ?? []),
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

function mergeDetails(task: Task, patch: UpdateTaskInput, timeZone: string): TaskDetails {
  const { reminder, thingsToTake, ...rest } = patch;
  return {
    ...detailsFromTask(task),
    ...rest,
    ...(thingsToTake === undefined ? {} : { thingsToTake: normalizeThings(thingsToTake) }),
    ...(reminder === undefined ? {} : { reminder: resolveReminder(reminder, timeZone) }),
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

function shiftExactReminder(reminder: TaskReminder | null, days: number): TaskReminder | null {
  if (reminder?.type !== 'exact' || days === 0) {
    return reminder;
  }
  return { ...reminder, localDateTime: shiftLocalDateTime(reminder.localDateTime, days) };
}

function reminderInPastIssues(reminder: TaskReminder | null, instant: Date): ValidationIssue[] {
  if (
    reminder?.type !== 'exact' ||
    !isValidLocalDateTime(reminder.localDateTime) ||
    !isValidTimeZone(reminder.timeZone)
  ) {
    return [];
  }
  const fireAt = zonedDateTimeToInstant(reminder.localDateTime, reminder.timeZone);
  return fireAt.getTime() <= instant.getTime()
    ? [{ field: 'reminder', message: REMINDER_IN_PAST_MESSAGE }]
    : [];
}

function restoreFromEvent(task: Task, event: TaskEvent, fallbackUpdatedAt: string): Task | null {
  const updatedAt = event.previousUpdatedAt ?? fallbackUpdatedAt;
  if (event.type === 'completed') {
    return task.status === 'completed'
      ? { ...task, status: 'active', completedAt: null, updatedAt }
      : null;
  }
  if (event.type === 'reminderSnoozed') {
    return task.status === 'active'
      ? { ...task, reminder: event.previousReminder, updatedAt }
      : null;
  }
  const isWhereEventLeftIt =
    task.status === 'active' &&
    task.placementType === 'carryOver' &&
    task.scheduledDate === event.toDate;
  const reminder = shiftExactReminder(task.reminder, -daysBetween(event.fromDate, event.toDate));
  return isWhereEventLeftIt
    ? { ...task, scheduledDate: event.fromDate, ...event.from, reminder, updatedAt }
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

export function createTaskService({ db, now, generateId, timeZone }: TaskServiceDeps): TaskService {
  const timestamp = () => now().toISOString();
  const listeners = new Set<() => void>();

  function notifyChanged() {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  async function inTransaction<T>(
    work: (repos: Repositories) => Promise<TaskResult<T>>,
  ): Promise<TaskResult<T>> {
    try {
      const committed = await db.transaction(async (tx) => {
        const result = await work(createRepositories(tx));
        if (!result.ok) {
          throw new TransactionAborted(result.error);
        }
        return result;
      });
      notifyChanged();
      return committed;
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
    requested: RankedSlotInput,
    details: TaskDetails = detailsFromTask(task),
  ): Promise<TaskResult<RankedTask>> {
    const slot = validateRankedSlot(requested);
    const validated = validateDetails(details);
    if (!slot.ok || !validated.ok) {
      return err(validationError([...issuesOf(slot), ...issuesOf(validated)]));
    }
    const conflict = await findConflict(repos.tasks, slot.value, task.id);
    if (conflict !== null) {
      return err(conflict);
    }
    const placed: RankedTask = { ...toRanked(task, slot.value, timestamp()), ...validated.value };
    return writeRanked(repos.tasks, placed, repos.tasks.update);
  }

  async function saveDetails(
    repos: Repositories,
    task: Task,
    details: TaskDetails,
  ): Promise<TaskResult<Task>> {
    const validated = validateDetails(details, { isFuture: isFutureTask(task) });
    if (!validated.ok) {
      return validated;
    }
    const updated: Task = { ...task, ...validated.value, updatedAt: timestamp() };
    await repos.tasks.update(updated);
    return ok(updated);
  }

  async function moveToFuture(
    repos: Repositories,
    task: Task,
    details: TaskDetails,
    clearReminder: boolean,
  ): Promise<TaskResult<FutureTask>> {
    if (task.reminder !== null && !clearReminder) {
      return err(reminderClearRequired(task.id));
    }
    const validated = validateDetails(clearReminder ? { ...details, reminder: null } : details, {
      isFuture: true,
    });
    if (!validated.ok) {
      return validated;
    }
    const moved: FutureTask = {
      ...task,
      ...validated.value,
      ...FUTURE_PLACEMENT,
      updatedAt: timestamp(),
    };
    await repos.tasks.update(moved);
    return ok(moved);
  }

  function applyEdit(
    repos: Repositories,
    task: Task,
    details: TaskDetails,
    change: PlacementChange,
  ): Promise<TaskResult<Task>> {
    if (change.kind === 'ranked') {
      return placeRanked(repos, task, change, details);
    }
    if (change.kind === 'future' && isScheduledTask(task)) {
      return moveToFuture(repos, task, details, change.clearReminder ?? false);
    }
    return saveDetails(repos, task, details);
  }

  return {
    getToday() {
      return toLocalDate(now(), timeZone());
    },

    getTimeZone() {
      return timeZone();
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

    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getTasksWithReminders() {
      return createTaskRepository(db).listActiveWithReminders();
    },

    snoozeReminder(id, localDateTime) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const blocked = completedGuard(task, 'snooze');
          if (blocked !== null) {
            return err(blocked);
          }
          if (!isScheduledTask(task)) {
            return err(invalidTaskState(task.id, 'snooze', 'future'));
          }
          const reminder: TaskReminder = { type: 'exact', localDateTime, timeZone: timeZone() };
          const validated = validateDetails({ ...detailsFromTask(task), reminder });
          if (!validated.ok) {
            return validated;
          }
          const instant = now();
          const pastIssues = reminderInPastIssues(reminder, instant);
          if (pastIssues.length > 0) {
            return err(validationError(pastIssues));
          }
          const occurredAt = instant.toISOString();
          const snoozed: Task = { ...task, reminder, updatedAt: occurredAt };
          const event: ReminderSnoozedEvent = {
            id: generateId(),
            taskId: task.id,
            type: 'reminderSnoozed',
            previousReminder: task.reminder,
            reminder,
            previousUpdatedAt: task.updatedAt,
            occurredAt,
          };
          await repos.tasks.update(snoozed);
          await repos.events.insert(event);
          return ok({ task: snoozed, event });
        }),
      );
    },

    rebaseReminderTimeZones(nextTimeZone) {
      return inTransaction(async (repos) => {
        if (!isValidTimeZone(nextTimeZone)) {
          return err(
            validationError([
              { field: 'reminder', message: 'Reminder time zone must be a valid IANA time zone' },
            ]),
          );
        }
        const updatedAt = timestamp();
        const changed: string[] = [];
        for (const task of await repos.tasks.listActiveWithReminders()) {
          if (task.reminder === null || task.reminder.timeZone === nextTimeZone) {
            continue;
          }
          await repos.tasks.update({
            ...task,
            reminder: { ...task.reminder, timeZone: nextTimeZone },
            updatedAt,
          });
          changed.push(task.id);
        }
        return ok(changed);
      });
    },

    claimReturnNotices(scheduledDate) {
      return db.transaction(async (tx) => {
        const notices = createReturnNoticeRepository(tx);
        const taskIds = await notices.listUnshown(scheduledDate);
        const shownAt = timestamp();
        for (const taskId of taskIds) {
          await notices.markShown(taskId, scheduledDate, shownAt);
        }
        return taskIds;
      });
    },

    async getPriorityAvailability(scheduledDate, options = {}) {
      const deck = await createTaskRepository(db).listDeck(scheduledDate);
      const occupants = new Map(
        deck.flatMap((task) =>
          task.placementType === 'ranked' ? [[task.priority, task] as const] : [],
        ),
      );
      return PRIORITIES_DESCENDING.map((priority) => {
        const occupant = occupants.get(priority);
        const isFree = occupant === undefined || occupant.id === options.exceptTaskId;
        return {
          priority,
          occupiedBy: isFree ? null : { id: occupant.id, title: occupant.title },
        };
      });
    },

    createTask(input) {
      return inTransaction(async (repos) => {
        const slot = validateRankedSlot({
          scheduledDate: input.scheduledDate,
          priority: input.priority,
        });
        const details = validateDetails(detailsFromInput(input.title, input, timeZone()));
        if (!slot.ok || !details.ok) {
          return err(validationError([...issuesOf(slot), ...issuesOf(details)]));
        }
        const instant = now();
        const pastIssues = reminderInPastIssues(details.value.reminder, instant);
        if (pastIssues.length > 0) {
          return err(validationError(pastIssues));
        }
        const conflict = await findConflict(repos.tasks, slot.value, null);
        if (conflict !== null) {
          return err(conflict);
        }
        const createdAt = instant.toISOString();
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
        const details = validateDetails(detailsFromInput(input.title, input, timeZone()), {
          isFuture: true,
        });
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
          const details = mergeDetails(task, patch, timeZone());
          const pastIssues =
            patch.reminder === undefined ? [] : reminderInPastIssues(details.reminder, now());
          if (pastIssues.length > 0) {
            return err(validationError(pastIssues));
          }
          return saveDetails(repos, task, details);
        }),
      );
    },

    editTask(id, input) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const { placement, ...patch } = input;
          if (placement.kind !== 'keep') {
            const blocked = completedGuard(task, 'edit');
            if (blocked !== null) {
              return err(blocked);
            }
          }
          const details = mergeDetails(task, patch, timeZone());
          const pastIssues =
            patch.reminder === undefined || placement.kind === 'future'
              ? []
              : reminderInPastIssues(details.reminder, now());
          if (pastIssues.length > 0) {
            return err(validationError(pastIssues));
          }
          return applyEdit(repos, task, details, placement);
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

    convertCarryOverToRanked(id, priority) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const blocked = completedGuard(task, 'convert');
          if (blocked !== null) {
            return err(blocked);
          }
          if (task.placementType !== 'carryOver') {
            return err(
              invalidTaskState(
                task.id,
                'convert',
                task.scheduledDate === null ? 'future' : 'ranked',
              ),
            );
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
            reminder: shiftExactReminder(task.reminder, daysBetween(fromDate, toDate)),
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

    moveTaskToFuture(id, options = {}) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          const blocked = completedGuard(task, 'moveToFuture');
          if (blocked !== null) {
            return err(blocked);
          }
          if (!isScheduledTask(task)) {
            return err(invalidTaskState(task.id, 'moveToFuture', 'future'));
          }
          return moveToFuture(repos, task, detailsFromTask(task), options.clearReminder ?? false);
        }),
      );
    },

    setThingToTakeChecked(id, index, checked) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          if (task.thingsToTake[index] === undefined) {
            return err(validationError([{ field: 'thingsToTake', message: 'Item not found' }]));
          }
          const updated: Task = {
            ...task,
            thingsToTake: task.thingsToTake.map((item, position) =>
              position === index ? { ...item, checked } : item,
            ),
            updatedAt: timestamp(),
          };
          await repos.tasks.update(updated);
          return ok(updated);
        }),
      );
    },

    deleteTask(id) {
      return inTransaction((repos) =>
        withTask(repos, id, async (task) => {
          await repos.tasks.softDelete(task.id, timestamp());
          return ok({ id: task.id });
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
