import { migrateDatabase } from '@/database/migrations';
import type { SqlDatabase, SqlExecutor } from '@/database/sql-database';
import {
  createNodeSqliteDatabase,
  type NodeSqliteDatabase,
} from '@/database/testing/node-sqlite-database';

import { createTaskService, type TaskResult, type TaskService } from '../model/task-service';
import type { TaskError } from '../model/task-errors';
import type {
  CreateFutureTaskInput,
  CreateTaskInput,
  FutureTask,
  RankedTask,
} from '../model/types';

const TODAY = '2026-09-11';
const TOMORROW = '2026-09-12';
const YESTERDAY = '2026-09-10';
const BERLIN = 'Europe/Berlin';
const BERLIN_MORNING = '2026-09-11T08:00:00.000Z';

type ServiceOptions = {
  start?: string;
  timeZone?: string;
  idPrefix?: string;
};

function createClock(start: string): () => Date {
  let current = Date.parse(start);
  return () => {
    current += 1000;
    return new Date(current);
  };
}

function createIdGenerator(prefix: string): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

function buildService(db: SqlDatabase, options: ServiceOptions = {}): TaskService {
  const zone = options.timeZone ?? BERLIN;
  return createTaskService({
    db,
    now: createClock(options.start ?? BERLIN_MORNING),
    generateId: createIdGenerator(options.idPrefix ?? 'task'),
    timeZone: () => zone,
  });
}

function unwrap<T>(result: TaskResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error.type}: ${result.error.message}`);
  }
  return result.value;
}

function unwrapError<T>(result: TaskResult<T>): TaskError {
  if (result.ok) {
    throw new Error('Expected a failure result');
  }
  return result.error;
}

function failOnWrite(db: SqlDatabase, failingWrite: number): SqlDatabase {
  let writes = 0;
  const wrap = (executor: SqlExecutor): SqlExecutor => ({
    ...executor,
    async run(sql, params) {
      writes += 1;
      if (writes === failingWrite) {
        throw new Error('Simulated write failure');
      }
      await executor.run(sql, params);
    },
  });
  return {
    ...db,
    transaction<T>(work: (tx: SqlExecutor) => Promise<T>) {
      return db.transaction((tx) => work(wrap(tx)));
    },
  };
}

describe('TaskService', () => {
  let db: NodeSqliteDatabase;
  let service: TaskService;

  async function create(
    input: Partial<CreateTaskInput> = {},
    target: TaskService = service,
  ): Promise<RankedTask> {
    return unwrap(
      await target.createTask({ title: 'Task', scheduledDate: TODAY, priority: 5, ...input }),
    );
  }

  async function createFuture(input: Partial<CreateFutureTaskInput> = {}): Promise<FutureTask> {
    return unwrap(await service.createFutureTask({ title: 'Someday', ...input }));
  }

  async function deckTitles(date: string): Promise<string[]> {
    return (await service.getDeck(date)).map((task) => task.title);
  }

  beforeEach(async () => {
    db = createNodeSqliteDatabase();
    await migrateDatabase(db);
    service = buildService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('createTask', () => {
    it('creates an active ranked task with normalized fields', async () => {
      const task = unwrap(
        await service.createTask({
          title: '  Dentist  ',
          scheduledDate: TODAY,
          priority: 7,
          description: '   ',
          address: ' Main St 1 ',
          thingsToTake: [{ text: ' passport ' }, { text: 'insurance card', checked: true }],
          durationMinutes: 45,
          travelMinutes: 20,
          reminder: { type: 'exact', localDateTime: '2026-09-11T17:30' },
        }),
      );

      expect(task).toEqual({
        id: 'task-1',
        title: 'Dentist',
        description: null,
        status: 'active',
        scheduledDate: TODAY,
        placementType: 'ranked',
        priority: 7,
        carryOverOrder: null,
        exactTime: null,
        dayPeriod: null,
        durationMinutes: 45,
        address: 'Main St 1',
        travelMinutes: 20,
        thingsToTake: [
          { text: 'passport', checked: false },
          { text: 'insurance card', checked: true },
        ],
        reminder: { type: 'exact', localDateTime: '2026-09-11T17:30', timeZone: BERLIN },
        createdAt: '2026-09-11T08:00:01.000Z',
        updatedAt: '2026-09-11T08:00:01.000Z',
        completedAt: null,
      });
      expect(unwrap(await service.getTask(task.id))).toEqual(task);
    });

    it('requires a title', async () => {
      const error = unwrapError(
        await service.createTask({ title: '   ', scheduledDate: TODAY, priority: 5 }),
      );

      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [{ field: 'title', message: 'Title is required' }],
      });
      expect(await service.getDeck(TODAY)).toEqual([]);
    });

    it('rejects an invalid scheduled date', async () => {
      const error = unwrapError(
        await service.createTask({ title: 'Task', scheduledDate: '2026-02-30', priority: 5 }),
      );

      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [{ field: 'scheduledDate' }],
      });
    });
  });

  describe('priority validation', () => {
    it.each([0, 11, -3, 5.5, Number.NaN])('rejects priority %p', async (priority) => {
      const error = unwrapError(
        await service.createTask({ title: 'Task', scheduledDate: TODAY, priority }),
      );

      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [{ field: 'priority', message: 'Priority must be an integer from 1 to 10' }],
      });
    });

    it.each([1, 10])('accepts boundary priority %p', async (priority) => {
      expect((await create({ priority })).priority).toBe(priority);
    });

    it('rejects an invalid priority change', async () => {
      const task = await create({ priority: 5 });

      const error = unwrapError(await service.changePriority(task.id, 12));

      expect(error).toMatchObject({ type: 'ValidationError', issues: [{ field: 'priority' }] });
      expect(unwrap(await service.getTask(task.id))).toEqual(task);
    });
  });

  describe('deck order', () => {
    it('orders ranked tasks from 10 to 1', async () => {
      for (const priority of [3, 10, 1, 7, 5]) {
        await create({ title: `P${priority}`, priority });
      }
      await create({ title: 'Other day', scheduledDate: TOMORROW, priority: 9 });

      expect(await deckTitles(TODAY)).toEqual(['P10', 'P7', 'P5', 'P3', 'P1']);
    });

    it('puts carry-over tasks above every ranked task of the day', async () => {
      const carried = await create({ title: 'Carried', priority: 3 });
      unwrap(await service.postponeUntilTomorrow(carried.id));
      await create({ title: 'Top ranked', scheduledDate: TOMORROW, priority: 10 });
      await create({ title: 'Bottom ranked', scheduledDate: TOMORROW, priority: 1 });

      expect(await deckTitles(TOMORROW)).toEqual(['Carried', 'Top ranked', 'Bottom ranked']);
    });

    it('excludes completed and future tasks', async () => {
      const completed = await create({ title: 'Completed', priority: 9 });
      unwrap(await service.completeTask(completed.id));
      await createFuture();
      await create({ title: 'Visible', priority: 2 });

      expect(await deckTitles(TODAY)).toEqual(['Visible']);
    });
  });

  describe('priority conflicts', () => {
    it('returns PriorityConflict with the occupied position and leaves data unchanged', async () => {
      const occupant = await create({ title: 'Gym', priority: 6 });

      const error = unwrapError(
        await service.createTask({ title: 'Call mom', scheduledDate: TODAY, priority: 6 }),
      );

      expect(error).toEqual({
        type: 'PriorityConflict',
        scheduledDate: TODAY,
        priority: 6,
        occupiedBy: { id: occupant.id, title: 'Gym' },
        message: `Priority 6 on ${TODAY} is already taken by "Gym"`,
      });
      expect(await service.getDeck(TODAY)).toEqual([occupant]);
    });

    it('returns PriorityConflict when a priority change targets an occupied position', async () => {
      const occupant = await create({ title: 'Gym', priority: 6 });
      const task = await create({ title: 'Read', priority: 3 });

      const error = unwrapError(await service.changePriority(task.id, 6));

      expect(error).toMatchObject({
        type: 'PriorityConflict',
        occupiedBy: { id: occupant.id, title: 'Gym' },
      });
      expect(unwrap(await service.getTask(task.id))).toEqual(task);
      expect(unwrap(await service.getTask(occupant.id))).toEqual(occupant);
    });

    it('allows the same priority on different days and after completion', async () => {
      const first = await create({ priority: 6 });
      await create({ scheduledDate: TOMORROW, priority: 6 });
      unwrap(await service.completeTask(first.id));

      expect((await create({ priority: 6 })).priority).toBe(6);
    });

    it('frees the priority on the source day after Not tonight', async () => {
      const task = await create({ priority: 6 });
      unwrap(await service.postponeUntilTomorrow(task.id));

      expect((await create({ priority: 6 })).priority).toBe(6);
      expect((await create({ scheduledDate: TOMORROW, priority: 6 })).priority).toBe(6);
    });
  });

  describe('swapPriorities', () => {
    it('atomically swaps priorities of two ranked tasks on the same day', async () => {
      const first = await create({ title: 'First', priority: 5 });
      const second = await create({ title: 'Second', priority: 8 });

      const swapped = unwrap(await service.swapPriorities(first.id, second.id));

      expect(swapped.first).toMatchObject({ id: first.id, priority: 8, placementType: 'ranked' });
      expect(swapped.second).toMatchObject({ id: second.id, priority: 5, placementType: 'ranked' });
      expect(await deckTitles(TODAY)).toEqual(['First', 'Second']);
      expect(unwrap(await service.getTask(first.id))).toEqual(swapped.first);
      expect(unwrap(await service.getTask(second.id))).toEqual(swapped.second);
    });

    it('rejects swapping tasks from different days', async () => {
      const first = await create({ priority: 5 });
      const second = await create({ scheduledDate: TOMORROW, priority: 8 });

      const error = unwrapError(await service.swapPriorities(first.id, second.id));

      expect(error).toMatchObject({ type: 'SwapNotAllowed', reason: 'different-days' });
    });

    it('rejects swapping with a carry-over or completed task', async () => {
      const ranked = await create({ scheduledDate: TOMORROW, priority: 5 });
      const carried = await create({ priority: 8 });
      unwrap(await service.postponeUntilTomorrow(carried.id));
      const completed = await create({ scheduledDate: TOMORROW, priority: 2 });
      unwrap(await service.completeTask(completed.id));

      expect(unwrapError(await service.swapPriorities(ranked.id, carried.id))).toMatchObject({
        type: 'SwapNotAllowed',
        reason: 'not-ranked',
      });
      expect(unwrapError(await service.swapPriorities(ranked.id, completed.id))).toMatchObject({
        type: 'SwapNotAllowed',
        reason: 'not-ranked',
      });
    });

    it('rejects swapping a task with itself', async () => {
      const task = await create();

      const error = unwrapError(await service.swapPriorities(task.id, task.id));

      expect(error).toMatchObject({ type: 'SwapNotAllowed', reason: 'same-task' });
    });

    it('returns TaskNotFound for a missing task', async () => {
      const task = await create();

      const error = unwrapError(await service.swapPriorities(task.id, 'missing'));

      expect(error).toMatchObject({ type: 'TaskNotFound', id: 'missing' });
    });
  });

  describe('exactTime and dayPeriod', () => {
    it('accepts exactTime alone', async () => {
      expect(await create({ exactTime: '07:30' })).toMatchObject({
        exactTime: '07:30',
        dayPeriod: null,
      });
    });

    it('accepts dayPeriod alone', async () => {
      expect(await create({ dayPeriod: 'evening' })).toMatchObject({
        exactTime: null,
        dayPeriod: 'evening',
      });
    });

    it('rejects exactTime and dayPeriod together', async () => {
      const error = unwrapError(
        await service.createTask({
          title: 'Task',
          scheduledDate: TODAY,
          priority: 5,
          exactTime: '07:30',
          dayPeriod: 'morning',
        }),
      );

      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [
          {
            field: 'exactTime',
            message: 'Exact time and day period cannot be set at the same time',
          },
        ],
      });
    });

    it.each(['24:00', '7:30', '12:60', 'noon'])('rejects malformed exactTime %p', async (time) => {
      const error = unwrapError(
        await service.createTask({
          title: 'Task',
          scheduledDate: TODAY,
          priority: 5,
          exactTime: time,
        }),
      );

      expect(error).toMatchObject({ type: 'ValidationError', issues: [{ field: 'exactTime' }] });
    });

    it('rejects adding exactTime to a task that already has dayPeriod', async () => {
      const task = await create({ dayPeriod: 'morning' });

      const error = unwrapError(await service.updateTask(task.id, { exactTime: '09:00' }));

      expect(error).toMatchObject({ type: 'ValidationError', issues: [{ field: 'exactTime' }] });
    });

    it('allows replacing dayPeriod with exactTime in one update', async () => {
      const task = await create({ dayPeriod: 'morning' });

      const updated = unwrap(
        await service.updateTask(task.id, { exactTime: '09:00', dayPeriod: null }),
      );

      expect(updated).toMatchObject({ exactTime: '09:00', dayPeriod: null });
    });
  });

  describe('reminder', () => {
    it('stores an exact local reminder in the OS time zone', async () => {
      const newYork = buildService(db, { timeZone: 'America/New_York', idPrefix: 'ny' });

      const task = await create(
        { reminder: { type: 'exact', localDateTime: '2026-09-11T19:45' } },
        newYork,
      );

      expect(task.reminder).toEqual({
        type: 'exact',
        localDateTime: '2026-09-11T19:45',
        timeZone: 'America/New_York',
      });
      expect(unwrap(await service.getTask(task.id)).reminder).toEqual(task.reminder);
    });

    it('stores a day-period reminder in the OS time zone', async () => {
      const task = await create({ reminder: { type: 'dayPeriod', period: 'evening' } });

      expect(task.reminder).toEqual({ type: 'dayPeriod', period: 'evening', timeZone: BERLIN });
    });

    it('allows a task without a reminder', async () => {
      expect((await create()).reminder).toBeNull();
    });

    it.each(['2026-09-11 18:00', '2026-02-30T10:00', '2026-09-11T25:00'])(
      'rejects an exact reminder at %p',
      async (localDateTime) => {
        const error = unwrapError(
          await service.createTask({
            title: 'Task',
            scheduledDate: TODAY,
            priority: 5,
            reminder: { type: 'exact', localDateTime },
          }),
        );

        expect(error).toMatchObject({ type: 'ValidationError', issues: [{ field: 'reminder' }] });
      },
    );

    it('rejects an invalid OS time zone', async () => {
      const broken = buildService(db, { timeZone: 'Mars/Olympus', idPrefix: 'mars' });

      const error = unwrapError(
        await broken.createTask({
          title: 'Task',
          scheduledDate: TODAY,
          priority: 5,
          reminder: { type: 'dayPeriod', period: 'night' },
        }),
      );

      expect(error).toMatchObject({ type: 'ValidationError', issues: [{ field: 'reminder' }] });
    });

    it('keeps the stored time zone until the reminder itself changes', async () => {
      const task = await create({ reminder: { type: 'dayPeriod', period: 'morning' } });
      const tokyo = buildService(db, { timeZone: 'Asia/Tokyo', idPrefix: 'tokyo' });

      const renamed = unwrap(await tokyo.updateTask(task.id, { title: 'Renamed' }));
      const rescheduled = unwrap(
        await tokyo.updateTask(task.id, {
          reminder: { type: 'exact', localDateTime: '2026-09-11T21:00' },
        }),
      );
      const cleared = unwrap(await tokyo.updateTask(task.id, { reminder: null }));

      expect(renamed.reminder).toEqual({ type: 'dayPeriod', period: 'morning', timeZone: BERLIN });
      expect(rescheduled.reminder).toEqual({
        type: 'exact',
        localDateTime: '2026-09-11T21:00',
        timeZone: 'Asia/Tokyo',
      });
      expect(cleared.reminder).toBeNull();
    });
  });

  describe('completeTask', () => {
    it('marks the task completed and frees its priority', async () => {
      const task = await create({ priority: 4 });

      const { task: completed, event } = unwrap(await service.completeTask(task.id));

      expect(completed).toMatchObject({
        status: 'completed',
        placementType: 'ranked',
        priority: 4,
      });
      expect(completed.completedAt).not.toBeNull();
      expect(completed.updatedAt).toBe(completed.completedAt);
      expect(unwrap(await service.getTask(task.id))).toEqual(completed);
      expect(await service.getHistory(task.id)).toEqual([event]);
      expect(event).toEqual({
        id: 'task-2',
        taskId: task.id,
        type: 'completed',
        scheduledDate: TODAY,
        previousUpdatedAt: task.updatedAt,
        occurredAt: completed.completedAt,
      });
      expect((await create({ priority: 4 })).priority).toBe(4);
    });

    it('completes a future task without placing it on a day', async () => {
      const task = await createFuture();

      const { task: completed } = unwrap(await service.completeTask(task.id));

      expect(completed).toMatchObject({ status: 'completed', scheduledDate: null, priority: null });
      expect(await service.getFuturePool()).toEqual([]);
    });

    it('rejects completing an already completed task', async () => {
      const task = await create();
      unwrap(await service.completeTask(task.id));

      const error = unwrapError(await service.completeTask(task.id));

      expect(error).toMatchObject({
        type: 'InvalidTaskState',
        action: 'complete',
        reason: 'completed',
      });
    });

    it('returns TaskNotFound for a missing task', async () => {
      expect(unwrapError(await service.completeTask('missing'))).toMatchObject({
        type: 'TaskNotFound',
        id: 'missing',
      });
    });
  });

  describe('postponeUntilTomorrow (Not tonight)', () => {
    it('moves the task to the next local day as an active carry-over and records history', async () => {
      const task = await create({ title: 'Gym', priority: 7 });

      const { task: moved, event } = unwrap(await service.postponeUntilTomorrow(task.id));

      expect(moved).toMatchObject({
        id: task.id,
        status: 'active',
        scheduledDate: TOMORROW,
        placementType: 'carryOver',
        priority: null,
        carryOverOrder: 1,
      });
      expect(event).toEqual({
        id: 'task-2',
        taskId: task.id,
        type: 'postponed',
        fromDate: TODAY,
        toDate: TOMORROW,
        from: { placementType: 'ranked', priority: 7, carryOverOrder: null },
        previousUpdatedAt: task.updatedAt,
        occurredAt: moved.updatedAt,
      });
      expect(unwrap(await service.getTask(task.id))).toEqual(moved);
      expect(await service.getHistory(task.id)).toEqual([event]);
      expect(await service.getDeck(TODAY)).toEqual([]);
    });

    it('uses the calendar day of the OS time zone instead of UTC', async () => {
      const losAngeles = buildService(db, {
        start: '2026-09-11T05:30:00.000Z',
        timeZone: 'America/Los_Angeles',
        idPrefix: 'la',
      });
      const tokyo = buildService(db, {
        start: '2026-09-11T20:00:00.000Z',
        timeZone: 'Asia/Tokyo',
        idPrefix: 'tokyo',
      });
      const lateInLosAngeles = await create({ scheduledDate: YESTERDAY }, losAngeles);
      const earlyInTokyo = await create({ scheduledDate: TODAY }, tokyo);

      const fromLosAngeles = unwrap(await losAngeles.postponeUntilTomorrow(lateInLosAngeles.id));
      const fromTokyo = unwrap(await tokyo.postponeUntilTomorrow(earlyInTokyo.id));

      expect(fromLosAngeles.task.scheduledDate).toBe('2026-09-11');
      expect(fromTokyo.task.scheduledDate).toBe('2026-09-13');
    });

    it('moves an overdue task to tomorrow rather than the day after its date', async () => {
      const overdue = await create({ scheduledDate: '2026-09-01' });

      const { task, event } = unwrap(await service.postponeUntilTomorrow(overdue.id));

      expect(task.scheduledDate).toBe(TOMORROW);
      expect(event.fromDate).toBe('2026-09-01');
    });

    it('moves a task planned for a later day to the day after that day', async () => {
      const later = await create({ scheduledDate: '2026-09-20' });

      const { task } = unwrap(await service.postponeUntilTomorrow(later.id));

      expect(task.scheduledDate).toBe('2026-09-21');
    });

    it('keeps the relative deck order of several carried-over tasks', async () => {
      const b = await create({ title: 'B', priority: 10 });
      const c = await create({ title: 'C', priority: 9 });
      const d = await create({ title: 'D', priority: 8 });
      await create({ title: 'E', scheduledDate: TOMORROW, priority: 6 });

      for (const task of [c, d, b]) {
        unwrap(await service.postponeUntilTomorrow(task.id));
      }

      const deck = await service.getDeck(TOMORROW);
      expect(deck.map((task) => task.title)).toEqual(['B', 'C', 'D', 'E']);
      expect(deck.map((task) => task.carryOverOrder)).toEqual([1, 2, 3, null]);
    });

    it('keeps carry-over tasks ahead of ranked ones when they move again', async () => {
      const yesterday = buildService(db, { start: '2026-09-10T08:00:00.000Z', idPrefix: 'y' });
      const x = await create({ title: 'X', scheduledDate: YESTERDAY, priority: 2 }, yesterday);
      unwrap(await yesterday.postponeUntilTomorrow(x.id));
      const b = await create({ title: 'B', priority: 10 });

      unwrap(await service.postponeUntilTomorrow(b.id));
      unwrap(await service.postponeUntilTomorrow(x.id));

      expect(await deckTitles(TODAY)).toEqual([]);
      expect(await deckTitles(TOMORROW)).toEqual(['X', 'B']);
      expect(
        (await service.getHistory(x.id)).map((event) =>
          event.type === 'postponed' ? event.toDate : null,
        ),
      ).toEqual([TODAY, TOMORROW]);
    });

    it('rejects future and completed tasks', async () => {
      const future = await createFuture();
      const completed = await create();
      unwrap(await service.completeTask(completed.id));

      expect(unwrapError(await service.postponeUntilTomorrow(future.id))).toMatchObject({
        type: 'InvalidTaskState',
        action: 'postpone',
        reason: 'future',
      });
      expect(unwrapError(await service.postponeUntilTomorrow(completed.id))).toMatchObject({
        type: 'InvalidTaskState',
        action: 'postpone',
        reason: 'completed',
      });
    });
  });

  describe('rescheduleTask', () => {
    it('moves the task to the chosen day with the chosen priority', async () => {
      const task = await create({ priority: 5 });

      const moved = unwrap(
        await service.rescheduleTask(task.id, { scheduledDate: '2026-09-15', priority: 9 }),
      );

      expect(moved).toMatchObject({
        scheduledDate: '2026-09-15',
        placementType: 'ranked',
        priority: 9,
        carryOverOrder: null,
        status: 'active',
      });
      expect(await service.getDeck(TODAY)).toEqual([]);
      expect(await service.getDeck('2026-09-15')).toEqual([moved]);
    });

    it('turns a carry-over task into a ranked task on the chosen day', async () => {
      const task = await create();
      unwrap(await service.postponeUntilTomorrow(task.id));

      const moved = unwrap(
        await service.rescheduleTask(task.id, { scheduledDate: '2026-09-15', priority: 3 }),
      );

      expect(moved).toMatchObject({ placementType: 'ranked', priority: 3, carryOverOrder: null });
    });

    it('returns PriorityConflict when the target position is taken', async () => {
      const task = await create({ priority: 5 });
      const occupant = await create({ title: 'Taken', scheduledDate: TOMORROW, priority: 9 });

      const error = unwrapError(
        await service.rescheduleTask(task.id, { scheduledDate: TOMORROW, priority: 9 }),
      );

      expect(error).toMatchObject({
        type: 'PriorityConflict',
        scheduledDate: TOMORROW,
        priority: 9,
        occupiedBy: { id: occupant.id, title: 'Taken' },
      });
      expect(unwrap(await service.getTask(task.id))).toEqual(task);
    });

    it('rejects future and completed tasks', async () => {
      const future = await createFuture();
      const completed = await create();
      unwrap(await service.completeTask(completed.id));
      const slot = { scheduledDate: TOMORROW, priority: 5 };

      expect(unwrapError(await service.rescheduleTask(future.id, slot))).toMatchObject({
        type: 'InvalidTaskState',
        reason: 'future',
      });
      expect(unwrapError(await service.rescheduleTask(completed.id, slot))).toMatchObject({
        type: 'InvalidTaskState',
        reason: 'completed',
      });
    });

    it('validates the target date and priority', async () => {
      const task = await create();

      const error = unwrapError(
        await service.rescheduleTask(task.id, { scheduledDate: 'tomorrow', priority: 0 }),
      );

      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [{ field: 'scheduledDate' }, { field: 'priority' }],
      });
    });
  });

  describe('future pool', () => {
    it('creates a future task without date, priority or placement', async () => {
      const task = await createFuture({ title: 'Learn Italian' });

      expect(task).toMatchObject({
        title: 'Learn Italian',
        status: 'active',
        scheduledDate: null,
        placementType: null,
        priority: null,
        carryOverOrder: null,
      });
      expect(await service.getFuturePool()).toEqual([task]);
      expect(await service.getDeck(TODAY)).toEqual([]);
    });

    it('requires a title for future tasks', async () => {
      expect(unwrapError(await service.createFutureTask({ title: '' }))).toMatchObject({
        type: 'ValidationError',
        issues: [{ field: 'title' }],
      });
    });

    it('schedules a future task on any day with a free priority', async () => {
      const task = await createFuture();

      const scheduled = unwrap(
        await service.scheduleFutureTask(task.id, { scheduledDate: TOMORROW, priority: 8 }),
      );

      expect(scheduled).toMatchObject({
        scheduledDate: TOMORROW,
        placementType: 'ranked',
        priority: 8,
        carryOverOrder: null,
      });
      expect(await service.getFuturePool()).toEqual([]);
      expect(await service.getDeck(TOMORROW)).toEqual([scheduled]);
    });

    it('returns PriorityConflict and keeps the task in the pool when the priority is taken', async () => {
      const occupant = await create({ title: 'Taken', priority: 8 });
      const task = await createFuture();

      const error = unwrapError(
        await service.scheduleFutureTask(task.id, { scheduledDate: TODAY, priority: 8 }),
      );

      expect(error).toMatchObject({
        type: 'PriorityConflict',
        occupiedBy: { id: occupant.id, title: 'Taken' },
      });
      expect(await service.getFuturePool()).toEqual([task]);
    });

    it('requires a valid priority when scheduling', async () => {
      const task = await createFuture();

      const error = unwrapError(
        await service.scheduleFutureTask(task.id, { scheduledDate: TODAY, priority: 11 }),
      );

      expect(error).toMatchObject({ type: 'ValidationError', issues: [{ field: 'priority' }] });
    });

    it('rejects scheduling a task that is already scheduled', async () => {
      const task = await create();

      const error = unwrapError(
        await service.scheduleFutureTask(task.id, { scheduledDate: TOMORROW, priority: 3 }),
      );

      expect(error).toMatchObject({
        type: 'InvalidTaskState',
        action: 'schedule',
        reason: 'scheduled',
      });
    });

    it('rejects changing the priority of a future task', async () => {
      const task = await createFuture();

      expect(unwrapError(await service.changePriority(task.id, 5))).toMatchObject({
        type: 'InvalidTaskState',
        action: 'changePriority',
        reason: 'future',
      });
    });
  });

  describe('changePriority', () => {
    it('moves a ranked task to a free priority', async () => {
      const task = await create({ priority: 5 });

      expect(unwrap(await service.changePriority(task.id, 8))).toMatchObject({ priority: 8 });
    });

    it('turns a carry-over task into a ranked task on the same day', async () => {
      const task = await create();
      unwrap(await service.postponeUntilTomorrow(task.id));

      const ranked = unwrap(await service.changePriority(task.id, 4));

      expect(ranked).toMatchObject({
        scheduledDate: TOMORROW,
        placementType: 'ranked',
        priority: 4,
        carryOverOrder: null,
      });
    });
  });

  describe('undo', () => {
    it('restores a completed task exactly and removes the completion event', async () => {
      const task = await create({ priority: 4 });
      const { event } = unwrap(await service.completeTask(task.id));

      const restored = unwrap(await service.undo(event.id));

      expect(restored).toEqual(task);
      expect(unwrap(await service.getTask(task.id))).toEqual(task);
      expect(await service.getHistory(task.id)).toEqual([]);
      expect(await service.getDeck(TODAY)).toEqual([task]);
    });

    it('restores the date, placement and history after Not tonight', async () => {
      const task = await create({ priority: 7 });
      const { event } = unwrap(await service.postponeUntilTomorrow(task.id));

      expect(unwrap(await service.undo(event.id))).toEqual(task);
      expect(await service.getDeck(TOMORROW)).toEqual([]);
      expect(await service.getDeck(TODAY)).toEqual([task]);
      expect(await service.getHistory(task.id)).toEqual([]);
    });

    it('returns a Mega Crush task to its previous carry-over position', async () => {
      const a = await create({ title: 'A', priority: 9 });
      const b = await create({ title: 'B', priority: 8 });
      unwrap(await service.postponeUntilTomorrow(a.id));
      unwrap(await service.postponeUntilTomorrow(b.id));
      const carriedA = unwrap(await service.getTask(a.id));
      const nextDay = buildService(db, { start: '2026-09-12T08:00:00.000Z', idPrefix: 'next' });
      const { event } = unwrap(await nextDay.postponeUntilTomorrow(a.id));
      expect(await deckTitles(TOMORROW)).toEqual(['B']);

      unwrap(await nextDay.undo(event.id));

      expect(await deckTitles(TOMORROW)).toEqual(['A', 'B']);
      expect(unwrap(await service.getTask(a.id))).toEqual(carriedA);
      expect((await service.getHistory(a.id)).map((item) => item.type)).toEqual(['postponed']);
    });

    it('returns PriorityConflict when the previous position was taken meanwhile', async () => {
      const task = await create({ priority: 5 });
      const { task: moved, event } = unwrap(await service.postponeUntilTomorrow(task.id));
      const occupant = await create({ title: 'New five', priority: 5 });

      const error = unwrapError(await service.undo(event.id));

      expect(error).toMatchObject({
        type: 'PriorityConflict',
        occupiedBy: { id: occupant.id, title: 'New five' },
      });
      expect(unwrap(await service.getTask(task.id))).toEqual(moved);
      expect(await service.getHistory(task.id)).toEqual([event]);
    });

    it('only undoes the latest action of a task', async () => {
      const task = await create();
      const { event: postponed } = unwrap(await service.postponeUntilTomorrow(task.id));
      unwrap(await service.completeTask(task.id));

      expect(unwrapError(await service.undo(postponed.id))).toMatchObject({
        type: 'UndoNotAvailable',
        reason: 'superseded',
      });
    });

    it('returns UndoNotAvailable for an unknown action', async () => {
      expect(unwrapError(await service.undo('missing'))).toMatchObject({
        type: 'UndoNotAvailable',
        reason: 'not-found',
      });
    });
  });

  describe('getPriorityAvailability', () => {
    it('lists priorities from 10 to 1 with the tasks that occupy them', async () => {
      const gym = await create({ title: 'Gym', priority: 10 });
      await create({ title: 'Read', priority: 3 });
      const carried = await create({ title: 'Carried', scheduledDate: YESTERDAY, priority: 3 });
      const yesterday = buildService(db, { start: '2026-09-10T08:00:00.000Z', idPrefix: 'y' });
      unwrap(await yesterday.postponeUntilTomorrow(carried.id));

      const slots = await service.getPriorityAvailability(TODAY);

      expect(slots.map((slot) => slot.priority)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      expect(slots[0]).toEqual({ priority: 10, occupiedBy: { id: gym.id, title: 'Gym' } });
      expect(slots.filter((slot) => slot.occupiedBy !== null).map((slot) => slot.priority)).toEqual(
        [10, 3],
      );
    });
  });

  describe('getToday', () => {
    it('returns the local calendar day of the OS time zone', () => {
      const tokyo = buildService(db, { start: '2026-09-11T22:30:00.000Z', timeZone: 'Asia/Tokyo' });

      expect(service.getToday()).toBe(TODAY);
      expect(tokyo.getToday()).toBe(TOMORROW);
    });
  });

  describe('Future pool transitions', () => {
    it('creates a Future task without date, priority or placement', async () => {
      const task = unwrap(
        await service.createFutureTask({
          title: 'Learn Italian',
          dayPeriod: 'evening',
          reminder: { type: 'dayPeriod', period: 'evening' },
        }),
      );

      expect(task).toMatchObject({
        scheduledDate: null,
        placementType: null,
        priority: null,
        carryOverOrder: null,
        dayPeriod: 'evening',
        reminder: { type: 'dayPeriod', period: 'evening', timeZone: BERLIN },
      });
      expect(await service.getDeck(TODAY)).toEqual([]);
    });

    it('lists Future tasks newest first', async () => {
      const older = await createFuture({ title: 'Older' });
      const newer = await createFuture({ title: 'Newer' });

      expect((await service.getFuturePool()).map((task) => task.id)).toEqual([newer.id, older.id]);
    });

    it('rejects a reminder with a date for a Future task', async () => {
      const error = unwrapError(
        await service.createFutureTask({
          title: 'Trip',
          reminder: { type: 'exact', localDateTime: '2026-09-20T10:00' },
        }),
      );

      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [
          { field: 'reminder', message: 'A reminder with a date cannot be set for a Future task' },
        ],
      });
      expect(await service.getFuturePool()).toEqual([]);
    });

    it('requires a date and a priority to schedule a Future task', async () => {
      const task = await createFuture();

      const error = unwrapError(
        await service.scheduleFutureTask(task.id, { scheduledDate: 'someday', priority: null }),
      );

      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [
          { field: 'scheduledDate' },
          { field: 'priority', message: 'Choose a priority from 1 to 10' },
        ],
      });
      expect(await service.getFuturePool()).toEqual([task]);
    });

    it('moves a scheduled task back to the Future pool and frees its priority', async () => {
      const task = await create({ title: 'Gym', priority: 6 });

      const moved = unwrap(await service.moveTaskToFuture(task.id));

      expect(moved).toMatchObject({
        id: task.id,
        scheduledDate: null,
        placementType: null,
        priority: null,
        carryOverOrder: null,
      });
      expect(await service.getFuturePool()).toEqual([moved]);
      expect(await service.getDeck(TODAY)).toEqual([]);
      expect((await service.getPriorityAvailability(TODAY))[4]).toEqual({
        priority: 6,
        occupiedBy: null,
      });
      expect((await create({ priority: 6 })).priority).toBe(6);
    });

    it('clears the carry-over order when a Mega Crush task moves to Future', async () => {
      const task = await create();
      unwrap(await service.postponeUntilTomorrow(task.id));

      const moved = unwrap(await service.moveTaskToFuture(task.id));

      expect(moved).toMatchObject({ placementType: null, carryOverOrder: null });
    });

    it('keeps the history of a task moved to the Future pool', async () => {
      const task = await create();
      const { event } = unwrap(await service.postponeUntilTomorrow(task.id));

      unwrap(await service.moveTaskToFuture(task.id));

      expect(await service.getHistory(task.id)).toEqual([event]);
    });

    it('asks before turning off a reminder with a date when moving to Future', async () => {
      const task = await create({
        reminder: { type: 'exact', localDateTime: '2026-09-11T18:00' },
      });

      expect(unwrapError(await service.moveTaskToFuture(task.id))).toMatchObject({
        type: 'ReminderRequiresDate',
        id: task.id,
      });
      expect(unwrap(await service.getTask(task.id))).toEqual(task);

      const moved = unwrap(await service.moveTaskToFuture(task.id, { clearDatedReminder: true }));

      expect(moved).toMatchObject({ scheduledDate: null, reminder: null });
    });

    it('converts a Mega Crush task into a ranked task', async () => {
      const task = await create({ priority: 5 });
      unwrap(await service.postponeUntilTomorrow(task.id));

      const ranked = unwrap(await service.convertCarryOverToRanked(task.id, 8));

      expect(ranked).toMatchObject({
        scheduledDate: TOMORROW,
        placementType: 'ranked',
        priority: 8,
        carryOverOrder: null,
      });
    });

    it('rejects converting to a taken priority and converting a ranked task', async () => {
      const task = await create({ priority: 5 });
      const { task: carried } = unwrap(await service.postponeUntilTomorrow(task.id));
      await create({ title: 'Taken', scheduledDate: TOMORROW, priority: 8 });
      const ranked = await create({ priority: 2 });

      expect(unwrapError(await service.convertCarryOverToRanked(task.id, 8))).toMatchObject({
        type: 'PriorityConflict',
      });
      expect(unwrap(await service.getTask(task.id))).toEqual(carried);
      expect(unwrapError(await service.convertCarryOverToRanked(ranked.id, 3))).toMatchObject({
        type: 'InvalidTaskState',
        reason: 'ranked',
      });
    });
  });

  describe('editTask', () => {
    it('saves details and a new day and priority in one step', async () => {
      const task = await create({ priority: 5 });

      const edited = unwrap(
        await service.editTask(task.id, {
          title: 'Renamed',
          placement: { kind: 'ranked', scheduledDate: TOMORROW, priority: 9 },
        }),
      );

      expect(edited).toMatchObject({ title: 'Renamed', scheduledDate: TOMORROW, priority: 9 });
    });

    it('treats the current priority of the task as available', async () => {
      const task = await create({ priority: 5 });

      const edited = unwrap(
        await service.editTask(task.id, {
          title: 'Same slot',
          placement: { kind: 'ranked', scheduledDate: TODAY, priority: 5 },
        }),
      );
      const slots = await service.getPriorityAvailability(TODAY, { exceptTaskId: task.id });

      expect(edited).toMatchObject({ title: 'Same slot', priority: 5 });
      expect(slots.every((slot) => slot.occupiedBy === null)).toBe(true);
    });

    it('saves nothing when the chosen priority is taken', async () => {
      const task = await create({ title: 'Original', priority: 5 });
      await create({ title: 'Taken', scheduledDate: TOMORROW, priority: 9 });

      const error = unwrapError(
        await service.editTask(task.id, {
          title: 'Changed',
          durationMinutes: 30,
          placement: { kind: 'ranked', scheduledDate: TOMORROW, priority: 9 },
        }),
      );

      expect(error).toMatchObject({ type: 'PriorityConflict', priority: 9 });
      expect(unwrap(await service.getTask(task.id))).toEqual(task);
    });

    it('reports every validation problem without saving', async () => {
      const task = await create();

      const error = unwrapError(
        await service.editTask(task.id, {
          title: ' ',
          durationMinutes: -5,
          travelMinutes: -1,
          exactTime: '09:00',
          dayPeriod: 'night',
          placement: { kind: 'ranked', scheduledDate: TODAY, priority: 11 },
        }),
      );

      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [
          { field: 'priority' },
          { field: 'title' },
          { field: 'exactTime' },
          { field: 'durationMinutes' },
          { field: 'travelMinutes' },
        ],
      });
      expect(unwrap(await service.getTask(task.id))).toEqual(task);
    });

    it('keeps a Mega Crush task carried over during a regular edit', async () => {
      const task = await create();
      const { task: carried } = unwrap(await service.postponeUntilTomorrow(task.id));

      const edited = unwrap(
        await service.editTask(task.id, { title: 'Renamed', placement: { kind: 'keep' } }),
      );

      expect(edited).toMatchObject({
        title: 'Renamed',
        placementType: 'carryOver',
        priority: null,
        carryOverOrder: carried.carryOverOrder,
      });
    });

    it('turns a Mega Crush task into a ranked task when a priority is chosen', async () => {
      const task = await create();
      unwrap(await service.postponeUntilTomorrow(task.id));

      const edited = unwrap(
        await service.editTask(task.id, {
          placement: { kind: 'ranked', scheduledDate: TOMORROW, priority: 4 },
        }),
      );

      expect(edited).toMatchObject({ placementType: 'ranked', priority: 4, carryOverOrder: null });
    });

    it('moves a task to Future and schedules it again', async () => {
      const task = await create({ priority: 3 });

      const future = unwrap(await service.editTask(task.id, { placement: { kind: 'future' } }));
      const scheduled = unwrap(
        await service.editTask(task.id, {
          placement: { kind: 'ranked', scheduledDate: TOMORROW, priority: 7 },
        }),
      );

      expect(future).toMatchObject({ scheduledDate: null, priority: null });
      expect(scheduled).toMatchObject({ scheduledDate: TOMORROW, priority: 7 });
    });
  });

  describe('things to take', () => {
    it('drops empty items and keeps the checked state', async () => {
      const task = await create({
        thingsToTake: [{ text: 'Passport' }, { text: '   ' }, { text: 'Charger', checked: true }],
      });

      expect(task.thingsToTake).toEqual([
        { text: 'Passport', checked: false },
        { text: 'Charger', checked: true },
      ]);
    });

    it('checks and unchecks an item', async () => {
      const task = await create({ thingsToTake: [{ text: 'Passport' }, { text: 'Charger' }] });

      const checked = unwrap(await service.setThingToTakeChecked(task.id, 1, true));
      const unchecked = unwrap(await service.setThingToTakeChecked(task.id, 1, false));

      expect(checked.thingsToTake[1]).toEqual({ text: 'Charger', checked: true });
      expect(unchecked.thingsToTake[1]).toEqual({ text: 'Charger', checked: false });
      expect(unwrapError(await service.setThingToTakeChecked(task.id, 5, true))).toMatchObject({
        type: 'ValidationError',
        issues: [{ field: 'thingsToTake' }],
      });
    });
  });

  describe('deleteTask', () => {
    it('removes the task from active views, frees its priority and keeps history', async () => {
      const task = await create({ priority: 7 });
      const other = await create({ title: 'Carried', priority: 4 });
      const { event } = unwrap(await service.postponeUntilTomorrow(other.id));

      unwrap(await service.deleteTask(task.id));
      unwrap(await service.deleteTask(other.id));

      expect(unwrapError(await service.getTask(task.id))).toMatchObject({ type: 'TaskNotFound' });
      expect(await service.getDeck(TODAY)).toEqual([]);
      expect(await service.getDeck(TOMORROW)).toEqual([]);
      expect((await service.getPriorityAvailability(TODAY))[3]).toEqual({
        priority: 7,
        occupiedBy: null,
      });
      expect((await create({ priority: 7 })).priority).toBe(7);
      expect(await service.getHistory(other.id)).toEqual([event]);
    });

    it('removes a Future task from the pool', async () => {
      const task = await createFuture();

      unwrap(await service.deleteTask(task.id));

      expect(await service.getFuturePool()).toEqual([]);
    });
  });

  describe('transactions', () => {
    it('rolls back every write when a transaction throws', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.run(
            `INSERT INTO tasks
               (id, title, status, scheduled_date, placement_type, priority, created_at, updated_at)
             VALUES ('tx-1', 'Temp', 'active', ?, 'ranked', 5, 'now', 'now')`,
            [TODAY],
          );
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await service.getDeck(TODAY)).toEqual([]);
    });

    it('rolls back a partially applied swap when a write fails', async () => {
      const first = await create({ priority: 5 });
      const second = await create({ priority: 8 });
      const failing = buildService(failOnWrite(db, 3), { idPrefix: 'failing' });

      await expect(failing.swapPriorities(first.id, second.id)).rejects.toThrow(
        'Simulated write failure',
      );

      expect(unwrap(await service.getTask(first.id))).toEqual(first);
      expect(unwrap(await service.getTask(second.id))).toEqual(second);
    });

    it('rolls back Not tonight when the history event cannot be written', async () => {
      const task = await create();
      const failing = buildService(failOnWrite(db, 2), { idPrefix: 'failing' });

      await expect(failing.postponeUntilTomorrow(task.id)).rejects.toThrow(
        'Simulated write failure',
      );

      expect(unwrap(await service.getTask(task.id))).toEqual(task);
      expect(await service.getHistory(task.id)).toEqual([]);
    });

    it('rolls back carry-over reordering when the move fails', async () => {
      const b = await create({ title: 'B', priority: 10 });
      const c = await create({ title: 'C', priority: 9 });
      unwrap(await service.postponeUntilTomorrow(c.id));
      const carriedC = unwrap(await service.getTask(c.id));
      const failing = buildService(failOnWrite(db, 3), { idPrefix: 'failing' });

      await expect(failing.postponeUntilTomorrow(b.id)).rejects.toThrow('Simulated write failure');

      expect(unwrap(await service.getTask(c.id))).toEqual(carriedC);
      expect(unwrap(await service.getTask(b.id))).toEqual(b);
    });

    it('keeps the database usable after a rolled back transaction', async () => {
      const failing = buildService(failOnWrite(db, 1), { idPrefix: 'failing' });
      await expect(
        failing.createTask({ title: 'A', scheduledDate: TODAY, priority: 5 }),
      ).rejects.toThrow('Simulated write failure');

      const task = await create({ priority: 5 });

      expect(await service.getDeck(TODAY)).toEqual([task]);
    });
  });
});
