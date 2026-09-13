import type { SqlExecutor } from '@/database/sql-database';

import {
  REMINDER_OWNER_TYPES,
  REMINDER_SCHEDULE_STATUSES,
  type ReminderOwnerType,
  type ReminderSchedule,
  type ReminderScheduleStatus,
} from '../model/types';

type ReminderScheduleRow = {
  owner_type: string;
  owner_id: string;
  status: string;
  notification_id: string | null;
  fire_at: string | null;
  fingerprint: string | null;
  scheduled_at: string | null;
  error: string | null;
  updated_at: string;
};

const SELECT = `SELECT owner_type, owner_id, status, notification_id, fire_at, fingerprint,
  scheduled_at, error, updated_at FROM reminder_schedules`;

export type ReminderScheduleRepository = {
  get(ownerType: ReminderOwnerType, ownerId: string): Promise<ReminderSchedule | null>;
  listAll(): Promise<ReminderSchedule[]>;
  save(schedule: ReminderSchedule): Promise<void>;
  delete(ownerType: ReminderOwnerType, ownerId: string): Promise<void>;
};

function isStatus(value: string): value is ReminderScheduleStatus {
  return (REMINDER_SCHEDULE_STATUSES as readonly string[]).includes(value);
}

function isOwnerType(value: string): value is ReminderOwnerType {
  return (REMINDER_OWNER_TYPES as readonly string[]).includes(value);
}

function toSchedule(row: ReminderScheduleRow): ReminderSchedule {
  if (!isStatus(row.status) || !isOwnerType(row.owner_type)) {
    throw new Error(`Reminder schedule for ${row.owner_type}:${row.owner_id} is invalid`);
  }
  return {
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    scheduledNotificationId: row.notification_id,
    reminderScheduleStatus: row.status,
    reminderScheduledAt: row.scheduled_at,
    reminderScheduleError: row.error,
    fireAt: row.fire_at,
    fingerprint: row.fingerprint,
    updatedAt: row.updated_at,
  };
}

export function createReminderScheduleRepository(db: SqlExecutor): ReminderScheduleRepository {
  return {
    async get(ownerType, ownerId) {
      const row = await db.get<ReminderScheduleRow>(
        `${SELECT} WHERE owner_type = ? AND owner_id = ?`,
        [ownerType, ownerId],
      );
      return row === null ? null : toSchedule(row);
    },

    async listAll() {
      const rows = await db.all<ReminderScheduleRow>(`${SELECT} ORDER BY owner_type, owner_id`);
      return rows.map(toSchedule);
    },

    async save(schedule) {
      await db.run(
        `INSERT INTO reminder_schedules
           (owner_type, owner_id, status, notification_id, fire_at, fingerprint,
            scheduled_at, error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (owner_type, owner_id) DO UPDATE SET
           status = excluded.status,
           notification_id = excluded.notification_id,
           fire_at = excluded.fire_at,
           fingerprint = excluded.fingerprint,
           scheduled_at = excluded.scheduled_at,
           error = excluded.error,
           updated_at = excluded.updated_at`,
        [
          schedule.ownerType,
          schedule.ownerId,
          schedule.reminderScheduleStatus,
          schedule.scheduledNotificationId,
          schedule.fireAt,
          schedule.fingerprint,
          schedule.reminderScheduledAt,
          schedule.reminderScheduleError,
          schedule.updatedAt,
        ],
      );
    },

    async delete(ownerType, ownerId) {
      await db.run('DELETE FROM reminder_schedules WHERE owner_type = ? AND owner_id = ?', [
        ownerType,
        ownerId,
      ]);
    },
  };
}
