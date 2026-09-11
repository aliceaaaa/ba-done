import type { SqlExecutor, SqlValue } from '@/database/sql-database';

import type { DeckPosition, PostponedEvent, TaskEvent } from '../model/types';

type TaskEventRow = {
  id: string;
  task_id: string;
  type: string;
  from_date: string | null;
  to_date: string | null;
  from_placement_type: string | null;
  from_priority: number | null;
  from_carry_over_order: number | null;
  previous_updated_at: string | null;
  occurred_at: string;
};

const COLUMNS = [
  'id',
  'task_id',
  'type',
  'from_date',
  'to_date',
  'from_placement_type',
  'from_priority',
  'from_carry_over_order',
  'previous_updated_at',
  'occurred_at',
] as const;

const SELECT_COLUMNS = COLUMNS.join(', ');
const INSERT_PLACEHOLDERS = COLUMNS.map(() => '?').join(', ');
const NEWEST_FIRST = 'ORDER BY occurred_at DESC, rowid DESC';

export type TaskEventRepository = {
  insert(event: TaskEvent): Promise<void>;
  findById(id: string): Promise<TaskEvent | null>;
  listByTask(taskId: string): Promise<TaskEvent[]>;
  findLatestForTask(taskId: string): Promise<TaskEvent | null>;
  findLatestArrival(taskId: string, toDate: string): Promise<PostponedEvent | null>;
  delete(id: string): Promise<void>;
};

function toPosition(row: TaskEventRow): DeckPosition {
  if (
    row.from_placement_type === 'ranked' &&
    row.from_priority !== null &&
    row.from_carry_over_order === null
  ) {
    return { placementType: 'ranked', priority: row.from_priority, carryOverOrder: null };
  }
  if (
    row.from_placement_type === 'carryOver' &&
    row.from_priority === null &&
    row.from_carry_over_order !== null
  ) {
    return {
      placementType: 'carryOver',
      priority: null,
      carryOverOrder: row.from_carry_over_order,
    };
  }
  throw new Error(`Task event ${row.id} has an invalid position`);
}

function toEvent(row: TaskEventRow): TaskEvent {
  if (row.type === 'postponed' && row.from_date !== null && row.to_date !== null) {
    return {
      id: row.id,
      taskId: row.task_id,
      type: 'postponed',
      fromDate: row.from_date,
      toDate: row.to_date,
      from: toPosition(row),
      previousUpdatedAt: row.previous_updated_at,
      occurredAt: row.occurred_at,
    };
  }
  if (row.type === 'completed') {
    return {
      id: row.id,
      taskId: row.task_id,
      type: 'completed',
      scheduledDate: row.from_date,
      previousUpdatedAt: row.previous_updated_at,
      occurredAt: row.occurred_at,
    };
  }
  throw new Error(`Task event ${row.id} is invalid`);
}

function toValues(event: TaskEvent): SqlValue[] {
  if (event.type === 'postponed') {
    return [
      event.id,
      event.taskId,
      event.type,
      event.fromDate,
      event.toDate,
      event.from.placementType,
      event.from.priority,
      event.from.carryOverOrder,
      event.previousUpdatedAt,
      event.occurredAt,
    ];
  }
  return [
    event.id,
    event.taskId,
    event.type,
    event.scheduledDate,
    null,
    null,
    null,
    null,
    event.previousUpdatedAt,
    event.occurredAt,
  ];
}

export function createTaskEventRepository(db: SqlExecutor): TaskEventRepository {
  async function select(where: string, params: readonly SqlValue[]): Promise<TaskEvent[]> {
    const rows = await db.all<TaskEventRow>(
      `SELECT ${SELECT_COLUMNS} FROM task_events ${where}`,
      params,
    );
    return rows.map(toEvent);
  }

  return {
    async insert(event) {
      await db.run(
        `INSERT INTO task_events (${SELECT_COLUMNS}) VALUES (${INSERT_PLACEHOLDERS})`,
        toValues(event),
      );
    },

    async findById(id) {
      const [event] = await select('WHERE id = ?', [id]);
      return event ?? null;
    },

    listByTask(taskId) {
      return select('WHERE task_id = ? ORDER BY occurred_at ASC, rowid ASC', [taskId]);
    },

    async findLatestForTask(taskId) {
      const [event] = await select(`WHERE task_id = ? ${NEWEST_FIRST} LIMIT 1`, [taskId]);
      return event ?? null;
    },

    async findLatestArrival(taskId, toDate) {
      const [event] = await select(
        `WHERE task_id = ? AND to_date = ? AND type = 'postponed' ${NEWEST_FIRST} LIMIT 1`,
        [taskId, toDate],
      );
      return event?.type === 'postponed' ? event : null;
    },

    async delete(id) {
      await db.run('DELETE FROM task_events WHERE id = ?', [id]);
    },
  };
}
