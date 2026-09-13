import type { SqlExecutor, SqlValue } from '@/database/sql-database';
import type { ThingToTake } from '@/entities/task';

import {
  EVENT_SOURCES,
  type CalendarEvent,
  type EventReminder,
  type EventSource,
} from '../model/types';

type CalendarEventRow = {
  id: string;
  title: string;
  all_day: number;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  time_zone: string;
  description: string | null;
  address: string | null;
  travel_minutes: number | null;
  things_to_take: string;
  reminder_local_date_time: string | null;
  reminder_time_zone: string | null;
  source: string;
  external_calendar_id: string | null;
  external_event_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS = [
  'id',
  'title',
  'all_day',
  'start_at',
  'end_at',
  'start_date',
  'end_date',
  'time_zone',
  'description',
  'address',
  'travel_minutes',
  'things_to_take',
  'reminder_local_date_time',
  'reminder_time_zone',
  'source',
  'external_calendar_id',
  'external_event_id',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

type Column = (typeof COLUMNS)[number];

const UPDATABLE_COLUMNS = COLUMNS.filter((column) => column !== 'id');
const SELECT_COLUMNS = COLUMNS.join(', ');
const INSERT_PLACEHOLDERS = COLUMNS.map(() => '?').join(', ');
const UPDATE_ASSIGNMENTS = UPDATABLE_COLUMNS.map((column) => `${column} = ?`).join(', ');
const EVENT_ORDER = `ORDER BY all_day DESC, COALESCE(start_at, start_date) ASC,
  COALESCE(end_at, end_date) ASC, title ASC, id ASC`;

export type EventRange = {
  fromInstant: string;
  toInstant: string;
  fromDate: string;
  toDate: string;
};

export type CalendarEventRepository = {
  findById(id: string): Promise<CalendarEvent | null>;
  listOverlapping(range: EventRange): Promise<CalendarEvent[]>;
  listWithReminders(): Promise<CalendarEvent[]>;
  insert(event: CalendarEvent): Promise<void>;
  update(event: CalendarEvent): Promise<void>;
  softDelete(id: string, deletedAt: string): Promise<void>;
};

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

function parseThings(raw: string, id: string): ThingToTake[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isThingToTake)) {
    throw new Error(`Calendar event ${id} has invalid things_to_take`);
  }
  return parsed.map((item) => ({ text: item.text, checked: item.checked }));
}

function isSource(value: string): value is EventSource {
  return (EVENT_SOURCES as readonly string[]).includes(value);
}

function toReminder(row: CalendarEventRow): EventReminder | null {
  if (row.reminder_local_date_time === null || row.reminder_time_zone === null) {
    return null;
  }
  return {
    type: 'exact',
    localDateTime: row.reminder_local_date_time,
    timeZone: row.reminder_time_zone,
  };
}

function toEvent(row: CalendarEventRow): CalendarEvent {
  if (!isSource(row.source)) {
    throw new Error(`Calendar event ${row.id} has unknown source "${row.source}"`);
  }
  const base = {
    id: row.id,
    title: row.title,
    timeZone: row.time_zone,
    description: row.description,
    address: row.address,
    travelMinutes: row.travel_minutes,
    thingsToTake: parseThings(row.things_to_take, row.id),
    reminder: toReminder(row),
    source: row.source,
    externalCalendarId: row.external_calendar_id,
    externalEventId: row.external_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
  if (row.all_day === 0 && row.start_at !== null && row.end_at !== null) {
    return {
      ...base,
      allDay: false,
      startAt: row.start_at,
      endAt: row.end_at,
      startDate: null,
      endDate: null,
    };
  }
  if (row.all_day === 1 && row.start_date !== null && row.end_date !== null) {
    return {
      ...base,
      allDay: true,
      startAt: null,
      endAt: null,
      startDate: row.start_date,
      endDate: row.end_date,
    };
  }
  throw new Error(`Calendar event ${row.id} has an invalid timing`);
}

function toValues(event: CalendarEvent): Record<Column, SqlValue> {
  return {
    id: event.id,
    title: event.title,
    all_day: event.allDay ? 1 : 0,
    start_at: event.startAt,
    end_at: event.endAt,
    start_date: event.startDate,
    end_date: event.endDate,
    time_zone: event.timeZone,
    description: event.description,
    address: event.address,
    travel_minutes: event.travelMinutes,
    things_to_take: JSON.stringify(
      event.thingsToTake.map((item) => ({ text: item.text, checked: item.checked })),
    ),
    reminder_local_date_time: event.reminder?.localDateTime ?? null,
    reminder_time_zone: event.reminder?.timeZone ?? null,
    source: event.source,
    external_calendar_id: event.externalCalendarId,
    external_event_id: event.externalEventId,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
    deleted_at: event.deletedAt,
  };
}

export function createCalendarEventRepository(db: SqlExecutor): CalendarEventRepository {
  async function select(condition: string, params: readonly SqlValue[]): Promise<CalendarEvent[]> {
    const rows = await db.all<CalendarEventRow>(
      `SELECT ${SELECT_COLUMNS} FROM calendar_events
       WHERE (${condition}) AND deleted_at IS NULL ${EVENT_ORDER}`,
      params,
    );
    return rows.map(toEvent);
  }

  return {
    async findById(id) {
      const [event] = await select('id = ?', [id]);
      return event ?? null;
    },

    listOverlapping({ fromInstant, toInstant, fromDate, toDate }) {
      return select(
        `(all_day = 0 AND start_at < ? AND end_at > ?)
         OR (all_day = 1 AND start_date <= ? AND end_date >= ?)`,
        [toInstant, fromInstant, toDate, fromDate],
      );
    },

    listWithReminders() {
      return select('reminder_local_date_time IS NOT NULL', []);
    },

    async insert(event) {
      const values = toValues(event);
      await db.run(
        `INSERT INTO calendar_events (${SELECT_COLUMNS}) VALUES (${INSERT_PLACEHOLDERS})`,
        COLUMNS.map((column) => values[column]),
      );
    },

    async update(event) {
      const values = toValues(event);
      await db.run(
        `UPDATE calendar_events SET ${UPDATE_ASSIGNMENTS} WHERE id = ? AND deleted_at IS NULL`,
        [...UPDATABLE_COLUMNS.map((column) => values[column]), event.id],
      );
    },

    async softDelete(id, deletedAt) {
      await db.run(
        `UPDATE calendar_events SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [deletedAt, deletedAt, id],
      );
    },
  };
}
