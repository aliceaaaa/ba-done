import { migrateDatabase } from '@/database/migrations';
import type { SqlValue } from '@/database/sql-database';
import {
  createNodeSqliteDatabase,
  type NodeSqliteDatabase,
} from '@/database/testing/node-sqlite-database';

import {
  createTaskRepository,
  isRankedPriorityUniqueViolation,
  type TaskRepository,
} from '../api/task-repository';
import { FUTURE_PLACEMENT, type FutureTask, type Task } from '../model/types';

const BASE_ROW: Record<string, SqlValue> = {
  id: 'row-1',
  title: 'Task',
  status: 'active',
  scheduled_date: '2026-09-11',
  placement_type: 'ranked',
  priority: 5,
  carry_over_order: null,
  created_at: '2026-09-11T08:00:00.000Z',
  updated_at: '2026-09-11T08:00:00.000Z',
};

const DETAILS: Omit<FutureTask, 'id'> = {
  title: 'Buy groceries',
  description: null,
  exactTime: null,
  dayPeriod: null,
  durationMinutes: null,
  address: null,
  travelMinutes: null,
  thingsToTake: [],
  reminder: null,
  status: 'active',
  createdAt: '2026-09-11T08:00:00.000Z',
  updatedAt: '2026-09-11T08:00:00.000Z',
  completedAt: null,
  ...FUTURE_PLACEMENT,
};

describe('TaskRepository', () => {
  let db: NodeSqliteDatabase;
  let repo: TaskRepository;

  async function insertRow(overrides: Record<string, SqlValue>): Promise<void> {
    const row = { ...BASE_ROW, ...overrides };
    const columns = Object.keys(row);
    await db.run(
      `INSERT INTO tasks (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      Object.values(row),
    );
  }

  beforeEach(async () => {
    db = createNodeSqliteDatabase();
    await migrateDatabase(db);
    repo = createTaskRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips ranked, carry-over and future tasks with reminders', async () => {
    const tasks: Task[] = [
      {
        ...DETAILS,
        thingsToTake: [
          { text: 'bags', checked: true },
          { text: 'list', checked: false },
        ],
        id: 'ranked',
        description: 'Weekly shopping',
        exactTime: '18:15',
        durationMinutes: 40,
        address: 'Market Square 3',
        travelMinutes: 15,
        reminder: { type: 'exact', localDateTime: '2026-09-11T17:30', timeZone: 'Europe/Berlin' },
        scheduledDate: '2026-09-11',
        placementType: 'ranked',
        priority: 7,
        carryOverOrder: null,
      },
      {
        ...DETAILS,
        thingsToTake: [],
        id: 'carry-over',
        dayPeriod: 'evening',
        reminder: { type: 'dayPeriod', period: 'evening', timeZone: 'Asia/Tokyo' },
        scheduledDate: '2026-09-12',
        placementType: 'carryOver',
        priority: null,
        carryOverOrder: 1,
      },
      { ...DETAILS, thingsToTake: [], id: 'future', ...FUTURE_PLACEMENT },
    ];

    for (const task of tasks) {
      await repo.insert(task);
    }

    for (const task of tasks) {
      expect(await repo.findById(task.id)).toEqual(task);
    }
  });

  it('hides soft-deleted tasks and frees their position', async () => {
    await insertRow({ id: 'a' });

    await repo.softDelete('a', '2026-09-11T09:00:00.000Z');

    expect(await repo.findById('a')).toBeNull();
    expect(await repo.listDeck('2026-09-11')).toEqual([]);
    await expect(insertRow({ id: 'b' })).resolves.toBeUndefined();
  });

  it('enforces a unique priority among active ranked tasks of a day', async () => {
    await insertRow({ id: 'a' });

    const duplicate = insertRow({ id: 'b' });

    await expect(duplicate).rejects.toThrow('UNIQUE constraint failed');
    await duplicate.catch((error: unknown) => {
      expect(isRankedPriorityUniqueViolation(error)).toBe(true);
    });
  });

  it('enforces a unique carry-over order among active tasks of a day', async () => {
    const carryOver = { placement_type: 'carryOver', priority: null, carry_over_order: 1 };
    await insertRow({ id: 'a', ...carryOver });

    await expect(insertRow({ id: 'b', ...carryOver })).rejects.toThrow(
      'UNIQUE constraint failed: tasks.scheduled_date, tasks.carry_over_order',
    );
  });

  it('allows the same position for completed tasks and other days', async () => {
    await insertRow({ id: 'a' });
    await insertRow({ id: 'b', status: 'completed', completed_at: '2026-09-11T09:00:00.000Z' });
    await insertRow({ id: 'c', scheduled_date: '2026-09-12' });

    expect(await repo.listDeck('2026-09-11')).toHaveLength(1);
  });

  it('accepts a complete future row', async () => {
    await expect(
      insertRow({ scheduled_date: null, placement_type: null, priority: null }),
    ).resolves.toBeUndefined();
  });

  it.each<[string, Record<string, SqlValue>]>([
    ['future task with a priority', { scheduled_date: null, placement_type: null }],
    ['future task with a placement type', { scheduled_date: null, priority: null }],
    [
      'future task with a carry-over order',
      {
        scheduled_date: null,
        placement_type: null,
        priority: null,
        carry_over_order: 1,
      },
    ],
    ['scheduled task without placement', { placement_type: null, priority: null }],
    ['ranked task without priority', { priority: null }],
    ['ranked task with a carry-over order', { carry_over_order: 1 }],
    ['carry-over task without order', { placement_type: 'carryOver', priority: null }],
    ['carry-over task with a priority', { placement_type: 'carryOver', carry_over_order: 1 }],
    ['zero carry-over order', { placement_type: 'carryOver', priority: null, carry_over_order: 0 }],
    ['unknown placement type', { placement_type: 'pinned' }],
    ['priority above 10', { priority: 11 }],
    ['priority below 1', { priority: 0 }],
    ['fractional priority', { priority: 2.5 }],
    ['postponed status', { status: 'postponed' }],
    ['empty title', { title: '  ' }],
    ['invalid date', { scheduled_date: '2026-02-30' }],
    ['exactTime with dayPeriod', { exact_time: '10:00', day_period: 'morning' }],
    ['malformed exactTime', { exact_time: '25:00' }],
    ['completed without completedAt', { status: 'completed' }],
    [
      'exact reminder without a time zone',
      {
        reminder_type: 'exact',
        reminder_local_date_time: '2026-09-11T10:00',
      },
    ],
    [
      'exact reminder with a period',
      {
        reminder_type: 'exact',
        reminder_local_date_time: '2026-09-11T10:00',
        reminder_period: 'morning',
        reminder_time_zone: 'Europe/Berlin',
      },
    ],
    [
      'day-period reminder without a period',
      {
        reminder_type: 'dayPeriod',
        reminder_time_zone: 'Europe/Berlin',
      },
    ],
    [
      'invalid reminder date-time',
      {
        reminder_type: 'exact',
        reminder_local_date_time: '2026-02-30T10:00',
        reminder_time_zone: 'Europe/Berlin',
      },
    ],
    ['reminder fields without a type', { reminder_time_zone: 'Europe/Berlin' }],
  ])('rejects %s at the database level', async (_label, overrides) => {
    await expect(insertRow(overrides)).rejects.toThrow('CHECK constraint failed');
  });

  it('rejects a postponed event that does not move the task forward', async () => {
    await insertRow({ id: 'a' });

    await expect(
      db.run(
        `INSERT INTO task_events
           (id, task_id, type, from_date, to_date, from_placement_type, from_priority, occurred_at)
         VALUES ('e1', 'a', 'postponed', '2026-09-12', '2026-09-12', 'ranked', 5, 'now')`,
      ),
    ).rejects.toThrow('CHECK constraint failed');
  });
});
