import type { SqlExecutor, SqlValue } from '@/database/sql-database';

import { isDayPeriod } from '../model/task-validation';
import {
  FUTURE_PLACEMENT,
  TASK_STATUSES,
  isFutureTask,
  isScheduledTask,
  type CarryOverTask,
  type FutureTask,
  type RankedTask,
  type ScheduledTask,
  type Task,
  type TaskPlacement,
  type TaskReminder,
  type TaskStatus,
  type ThingToTake,
} from '../model/types';

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduled_date: string | null;
  placement_type: string | null;
  priority: number | null;
  carry_over_order: number | null;
  exact_time: string | null;
  day_period: string | null;
  duration_minutes: number | null;
  address: string | null;
  travel_minutes: number | null;
  things_to_take: string;
  reminder_type: string | null;
  reminder_local_date_time: string | null;
  reminder_period: string | null;
  reminder_time_zone: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const COLUMNS = [
  'id',
  'title',
  'description',
  'status',
  'scheduled_date',
  'placement_type',
  'priority',
  'carry_over_order',
  'exact_time',
  'day_period',
  'duration_minutes',
  'address',
  'travel_minutes',
  'things_to_take',
  'reminder_type',
  'reminder_local_date_time',
  'reminder_period',
  'reminder_time_zone',
  'created_at',
  'updated_at',
  'completed_at',
] as const;

type Column = (typeof COLUMNS)[number];

const UPDATABLE_COLUMNS = COLUMNS.filter((column) => column !== 'id');
const SELECT_COLUMNS = COLUMNS.join(', ');
const INSERT_PLACEHOLDERS = COLUMNS.map(() => '?').join(', ');
const UPDATE_ASSIGNMENTS = UPDATABLE_COLUMNS.map((column) => `${column} = ?`).join(', ');
const DECK_ORDER = `CASE placement_type WHEN 'carryOver' THEN 0 ELSE 1 END,
  carry_over_order ASC,
  priority DESC`;

const RANKED_PRIORITY_UNIQUE_MESSAGE =
  'UNIQUE constraint failed: tasks.scheduled_date, tasks.priority';

export type TaskRepository = {
  findById(id: string): Promise<Task | null>;
  findActiveRanked(scheduledDate: string, priority: number): Promise<RankedTask | null>;
  listDeck(scheduledDate: string): Promise<ScheduledTask[]>;
  listActiveCarryOvers(scheduledDate: string): Promise<CarryOverTask[]>;
  listFuturePool(): Promise<FutureTask[]>;
  listActiveWithReminders(): Promise<Task[]>;
  insert(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
  setCarryOverOrder(id: string, carryOverOrder: number): Promise<void>;
  softDelete(id: string, deletedAt: string): Promise<void>;
};

export function isRankedPriorityUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.includes(RANKED_PRIORITY_UNIQUE_MESSAGE)
  );
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

function isThingToTake(value: unknown): value is ThingToTake {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof value.text === 'string' &&
    'checked' in value &&
    typeof value.checked === 'boolean'
  );
}

function parseThingsToTake(raw: string, id: string): ThingToTake[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isThingToTake)) {
    throw new Error(`Task ${id} has invalid things_to_take`);
  }
  return parsed.map((item) => ({ text: item.text, checked: item.checked }));
}

function toPlacement(row: TaskRow): TaskPlacement {
  const {
    scheduled_date: scheduledDate,
    placement_type: placementType,
    priority,
    carry_over_order: carryOverOrder,
  } = row;
  if (
    scheduledDate === null &&
    placementType === null &&
    priority === null &&
    carryOverOrder === null
  ) {
    return FUTURE_PLACEMENT;
  }
  if (
    scheduledDate !== null &&
    placementType === 'ranked' &&
    priority !== null &&
    carryOverOrder === null
  ) {
    return { scheduledDate, placementType, priority, carryOverOrder };
  }
  if (
    scheduledDate !== null &&
    placementType === 'carryOver' &&
    priority === null &&
    carryOverOrder !== null
  ) {
    return { scheduledDate, placementType, priority, carryOverOrder };
  }
  throw new Error(`Task ${row.id} has an invalid placement`);
}

function toReminder(row: TaskRow): TaskReminder | null {
  const {
    reminder_type: type,
    reminder_local_date_time: localDateTime,
    reminder_period: period,
    reminder_time_zone: timeZone,
  } = row;
  if (type === null && localDateTime === null && period === null && timeZone === null) {
    return null;
  }
  if (type === 'exact' && localDateTime !== null && period === null && timeZone !== null) {
    return { type, localDateTime, timeZone };
  }
  if (
    type === 'dayPeriod' &&
    localDateTime === null &&
    period !== null &&
    isDayPeriod(period) &&
    timeZone !== null
  ) {
    return { type, period, timeZone };
  }
  throw new Error(`Task ${row.id} has an invalid reminder`);
}

function toTask(row: TaskRow): Task {
  if (!isTaskStatus(row.status)) {
    throw new Error(`Task ${row.id} has invalid status "${row.status}"`);
  }
  if (row.day_period !== null && !isDayPeriod(row.day_period)) {
    throw new Error(`Task ${row.id} has invalid day period "${row.day_period}"`);
  }
  const base = {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    exactTime: row.exact_time,
    dayPeriod: row.day_period,
    durationMinutes: row.duration_minutes,
    address: row.address,
    travelMinutes: row.travel_minutes,
    thingsToTake: parseThingsToTake(row.things_to_take, row.id),
    reminder: toReminder(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
  return { ...base, ...toPlacement(row) };
}

function toValues(task: Task): Record<Column, SqlValue> {
  const { reminder } = task;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    scheduled_date: task.scheduledDate,
    placement_type: task.placementType,
    priority: task.priority,
    carry_over_order: task.carryOverOrder,
    exact_time: task.exactTime,
    day_period: task.dayPeriod,
    duration_minutes: task.durationMinutes,
    address: task.address,
    travel_minutes: task.travelMinutes,
    things_to_take: JSON.stringify(
      task.thingsToTake.map((item) => ({ text: item.text, checked: item.checked })),
    ),
    reminder_type: reminder?.type ?? null,
    reminder_local_date_time: reminder?.type === 'exact' ? reminder.localDateTime : null,
    reminder_period: reminder?.type === 'dayPeriod' ? reminder.period : null,
    reminder_time_zone: reminder?.timeZone ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    completed_at: task.completedAt,
  };
}

export function createTaskRepository(db: SqlExecutor): TaskRepository {
  async function select(
    condition: string,
    params: readonly SqlValue[],
    order = '',
  ): Promise<Task[]> {
    const rows = await db.all<TaskRow>(
      `SELECT ${SELECT_COLUMNS} FROM tasks WHERE (${condition}) AND deleted_at IS NULL ${order}`,
      params,
    );
    return rows.map(toTask);
  }

  return {
    async findById(id) {
      const [task] = await select('id = ?', [id]);
      return task ?? null;
    },

    async findActiveRanked(scheduledDate, priority) {
      const [task] = await select(
        `scheduled_date = ? AND priority = ? AND status = 'active' AND placement_type = 'ranked'`,
        [scheduledDate, priority],
      );
      return task?.placementType === 'ranked' ? task : null;
    },

    async listDeck(scheduledDate) {
      const tasks = await select(
        `scheduled_date = ? AND status = 'active'`,
        [scheduledDate],
        `ORDER BY ${DECK_ORDER}`,
      );
      return tasks.filter(isScheduledTask);
    },

    async listActiveCarryOvers(scheduledDate) {
      const tasks = await select(
        `scheduled_date = ? AND status = 'active' AND placement_type = 'carryOver'`,
        [scheduledDate],
        'ORDER BY carry_over_order ASC',
      );
      return tasks.filter((task): task is CarryOverTask => task.placementType === 'carryOver');
    },

    async listFuturePool() {
      const tasks = await select(
        `scheduled_date IS NULL AND status = 'active'`,
        [],
        'ORDER BY created_at DESC, id DESC',
      );
      return tasks.filter(isFutureTask);
    },

    listActiveWithReminders() {
      return select(
        `reminder_type IS NOT NULL AND status = 'active'`,
        [],
        'ORDER BY created_at ASC, id ASC',
      );
    },

    async insert(task) {
      const values = toValues(task);
      await db.run(
        `INSERT INTO tasks (${SELECT_COLUMNS}) VALUES (${INSERT_PLACEHOLDERS})`,
        COLUMNS.map((column) => values[column]),
      );
    },

    async update(task) {
      const values = toValues(task);
      await db.run(`UPDATE tasks SET ${UPDATE_ASSIGNMENTS} WHERE id = ? AND deleted_at IS NULL`, [
        ...UPDATABLE_COLUMNS.map((column) => values[column]),
        task.id,
      ]);
    },

    async setCarryOverOrder(id, carryOverOrder) {
      await db.run(
        `UPDATE tasks SET carry_over_order = ?
         WHERE id = ? AND placement_type = 'carryOver' AND deleted_at IS NULL`,
        [carryOverOrder, id],
      );
    },

    async softDelete(id, deletedAt) {
      await db.run(
        'UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [deletedAt, deletedAt, id],
      );
    },
  };
}
