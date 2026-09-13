import type { SqlExecutor } from '@/database/sql-database';

import {
  REMINDER_SCHEDULE_STATUSES,
  type ReminderSchedule,
  type ReminderScheduleStatus,
} from '../model/types';

type ReminderScheduleRow = {
  task_id: string;
  status: string;
  notification_id: string | null;
  fire_at: string | null;
  fingerprint: string | null;
  scheduled_at: string | null;
  error: string | null;
  updated_at: string;
};

const SELECT =
  'SELECT task_id, status, notification_id, fire_at, fingerprint, scheduled_at, error, updated_at FROM reminder_schedules';

export type ReminderScheduleRepository = {
  get(taskId: string): Promise<ReminderSchedule | null>;
  listAll(): Promise<ReminderSchedule[]>;
  save(schedule: ReminderSchedule): Promise<void>;
  delete(taskId: string): Promise<void>;
};

function isStatus(value: string): value is ReminderScheduleStatus {
  return (REMINDER_SCHEDULE_STATUSES as readonly string[]).includes(value);
}

function toSchedule(row: ReminderScheduleRow): ReminderSchedule {
  if (!isStatus(row.status)) {
    throw new Error(`Reminder schedule for ${row.task_id} has invalid status "${row.status}"`);
  }
  return {
    taskId: row.task_id,
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
    async get(taskId) {
      const row = await db.get<ReminderScheduleRow>(`${SELECT} WHERE task_id = ?`, [taskId]);
      return row === null ? null : toSchedule(row);
    },

    async listAll() {
      const rows = await db.all<ReminderScheduleRow>(`${SELECT} ORDER BY task_id`);
      return rows.map(toSchedule);
    },

    async save(schedule) {
      await db.run(
        `INSERT INTO reminder_schedules
           (task_id, status, notification_id, fire_at, fingerprint, scheduled_at, error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (task_id) DO UPDATE SET
           status = excluded.status,
           notification_id = excluded.notification_id,
           fire_at = excluded.fire_at,
           fingerprint = excluded.fingerprint,
           scheduled_at = excluded.scheduled_at,
           error = excluded.error,
           updated_at = excluded.updated_at`,
        [
          schedule.taskId,
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

    async delete(taskId) {
      await db.run('DELETE FROM reminder_schedules WHERE task_id = ?', [taskId]);
    },
  };
}
