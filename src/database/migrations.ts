import type { SqlDatabase, SqlExecutor } from './sql-database';

export const DATABASE_NAME = 'planner.db';

export type Migration = (db: SqlExecutor) => Promise<void>;

const createTasksSchema: Migration = async (db) => {
  await db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      description TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
      scheduled_date TEXT CHECK (scheduled_date IS NULL OR scheduled_date IS date(scheduled_date)),
      placement_type TEXT CHECK (placement_type IS NULL OR placement_type IN ('ranked', 'carryOver')),
      priority INTEGER CHECK (
        priority IS NULL OR (typeof(priority) = 'integer' AND priority BETWEEN 1 AND 10)
      ),
      carry_over_order INTEGER CHECK (
        carry_over_order IS NULL
        OR (typeof(carry_over_order) = 'integer' AND carry_over_order >= 1)
      ),
      exact_time TEXT CHECK (exact_time IS NULL OR exact_time IS strftime('%H:%M', exact_time)),
      day_period TEXT CHECK (
        day_period IS NULL OR day_period IN ('morning', 'afternoon', 'evening', 'night')
      ),
      duration_minutes INTEGER CHECK (
        duration_minutes IS NULL OR (typeof(duration_minutes) = 'integer' AND duration_minutes > 0)
      ),
      address TEXT,
      travel_minutes INTEGER CHECK (
        travel_minutes IS NULL OR (typeof(travel_minutes) = 'integer' AND travel_minutes >= 0)
      ),
      things_to_take TEXT NOT NULL DEFAULT '[]' CHECK (
        json_valid(things_to_take) AND json_type(things_to_take) = 'array'
      ),
      reminder_type TEXT CHECK (reminder_type IS NULL OR reminder_type IN ('exact', 'dayPeriod')),
      reminder_local_date_time TEXT CHECK (
        reminder_local_date_time IS NULL
        OR reminder_local_date_time IS strftime('%Y-%m-%dT%H:%M', reminder_local_date_time)
      ),
      reminder_period TEXT CHECK (
        reminder_period IS NULL OR reminder_period IN ('morning', 'afternoon', 'evening', 'night')
      ),
      reminder_time_zone TEXT CHECK (
        reminder_time_zone IS NULL OR length(reminder_time_zone) > 0
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      CHECK (
        (scheduled_date IS NULL AND placement_type IS NULL
          AND priority IS NULL AND carry_over_order IS NULL)
        OR (scheduled_date IS NOT NULL AND placement_type = 'ranked'
          AND priority IS NOT NULL AND carry_over_order IS NULL)
        OR (scheduled_date IS NOT NULL AND placement_type = 'carryOver'
          AND priority IS NULL AND carry_over_order IS NOT NULL)
      ),
      CHECK (
        (reminder_type IS NULL AND reminder_local_date_time IS NULL
          AND reminder_period IS NULL AND reminder_time_zone IS NULL)
        OR (reminder_type = 'exact' AND reminder_local_date_time IS NOT NULL
          AND reminder_period IS NULL AND reminder_time_zone IS NOT NULL)
        OR (reminder_type = 'dayPeriod' AND reminder_local_date_time IS NULL
          AND reminder_period IS NOT NULL AND reminder_time_zone IS NOT NULL)
      ),
      CHECK (exact_time IS NULL OR day_period IS NULL),
      CHECK ((status = 'completed') = (completed_at IS NOT NULL))
    );

    CREATE UNIQUE INDEX tasks_ranked_priority_unique
      ON tasks (scheduled_date, priority)
      WHERE status = 'active' AND placement_type = 'ranked';

    CREATE UNIQUE INDEX tasks_carry_over_order_unique
      ON tasks (scheduled_date, carry_over_order)
      WHERE status = 'active' AND placement_type = 'carryOver';

    CREATE INDEX tasks_deck_idx ON tasks (scheduled_date, status);

    CREATE TABLE task_events (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('postponed')),
      from_date TEXT NOT NULL CHECK (from_date IS date(from_date)),
      to_date TEXT NOT NULL CHECK (to_date IS date(to_date)),
      from_placement_type TEXT NOT NULL CHECK (from_placement_type IN ('ranked', 'carryOver')),
      from_priority INTEGER,
      from_carry_over_order INTEGER,
      occurred_at TEXT NOT NULL,
      CHECK (to_date > from_date),
      CHECK (
        (from_placement_type = 'ranked' AND from_priority BETWEEN 1 AND 10
          AND from_carry_over_order IS NULL)
        OR (from_placement_type = 'carryOver' AND from_carry_over_order >= 1
          AND from_priority IS NULL)
      )
    );

    CREATE INDEX task_events_arrival_idx ON task_events (task_id, to_date, occurred_at);
  `);
};

const addCompletionEvents: Migration = async (db) => {
  await db.exec(`
    CREATE TABLE task_events_next (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('postponed', 'completed')),
      from_date TEXT CHECK (from_date IS NULL OR from_date IS date(from_date)),
      to_date TEXT CHECK (to_date IS NULL OR to_date IS date(to_date)),
      from_placement_type TEXT CHECK (
        from_placement_type IS NULL OR from_placement_type IN ('ranked', 'carryOver')
      ),
      from_priority INTEGER,
      from_carry_over_order INTEGER,
      previous_updated_at TEXT,
      occurred_at TEXT NOT NULL,
      CHECK (
        (type = 'postponed' AND from_date IS NOT NULL AND to_date IS NOT NULL
          AND to_date > from_date
          AND (
            (from_placement_type = 'ranked' AND from_priority BETWEEN 1 AND 10
              AND from_carry_over_order IS NULL)
            OR (from_placement_type = 'carryOver' AND from_carry_over_order >= 1
              AND from_priority IS NULL)
          ))
        OR (type = 'completed' AND to_date IS NULL AND from_placement_type IS NULL
          AND from_priority IS NULL AND from_carry_over_order IS NULL)
      )
    );

    INSERT INTO task_events_next (
      id, task_id, type, from_date, to_date, from_placement_type,
      from_priority, from_carry_over_order, previous_updated_at, occurred_at
    )
    SELECT
      id, task_id, type, from_date, to_date, from_placement_type,
      from_priority, from_carry_over_order, NULL, occurred_at
    FROM task_events;

    DROP TABLE task_events;

    ALTER TABLE task_events_next RENAME TO task_events;

    CREATE INDEX task_events_arrival_idx ON task_events (task_id, to_date, occurred_at);
    CREATE INDEX task_events_latest_idx ON task_events (task_id, occurred_at);
  `);
};

const addSoftDeleteAndCheckableThings: Migration = async (db) => {
  await db.exec(`
    ALTER TABLE tasks ADD COLUMN deleted_at TEXT;

    DROP INDEX tasks_ranked_priority_unique;
    DROP INDEX tasks_carry_over_order_unique;

    CREATE UNIQUE INDEX tasks_ranked_priority_unique
      ON tasks (scheduled_date, priority)
      WHERE status = 'active' AND placement_type = 'ranked' AND deleted_at IS NULL;

    CREATE UNIQUE INDEX tasks_carry_over_order_unique
      ON tasks (scheduled_date, carry_over_order)
      WHERE status = 'active' AND placement_type = 'carryOver' AND deleted_at IS NULL;

    UPDATE tasks
    SET things_to_take = (
      SELECT json_group_array(json_object('text', value, 'checked', json('false')))
      FROM json_each(tasks.things_to_take)
    )
    WHERE json_array_length(things_to_take) > 0;
  `);
};

const addCarryOverReturnNotices: Migration = async (db) => {
  await db.exec(`
    CREATE TABLE carry_over_return_notices (
      task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
      scheduled_date TEXT NOT NULL CHECK (scheduled_date IS date(scheduled_date)),
      shown_at TEXT NOT NULL,
      PRIMARY KEY (task_id, scheduled_date)
    );
  `);
};

const addReminderScheduling: Migration = async (db) => {
  await db.exec(`
    CREATE TABLE task_events_next (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('postponed', 'completed', 'reminderSnoozed')),
      from_date TEXT CHECK (from_date IS NULL OR from_date IS date(from_date)),
      to_date TEXT CHECK (to_date IS NULL OR to_date IS date(to_date)),
      from_placement_type TEXT CHECK (
        from_placement_type IS NULL OR from_placement_type IN ('ranked', 'carryOver')
      ),
      from_priority INTEGER,
      from_carry_over_order INTEGER,
      previous_updated_at TEXT,
      details TEXT CHECK (details IS NULL OR json_valid(details)),
      occurred_at TEXT NOT NULL,
      CHECK (
        (type = 'postponed' AND from_date IS NOT NULL AND to_date IS NOT NULL
          AND to_date > from_date AND details IS NULL
          AND (
            (from_placement_type = 'ranked' AND from_priority BETWEEN 1 AND 10
              AND from_carry_over_order IS NULL)
            OR (from_placement_type = 'carryOver' AND from_carry_over_order >= 1
              AND from_priority IS NULL)
          ))
        OR (type = 'completed' AND to_date IS NULL AND from_placement_type IS NULL
          AND from_priority IS NULL AND from_carry_over_order IS NULL AND details IS NULL)
        OR (type = 'reminderSnoozed' AND from_date IS NULL AND to_date IS NULL
          AND from_placement_type IS NULL AND from_priority IS NULL
          AND from_carry_over_order IS NULL AND details IS NOT NULL)
      )
    );

    INSERT INTO task_events_next (
      id, task_id, type, from_date, to_date, from_placement_type,
      from_priority, from_carry_over_order, previous_updated_at, details, occurred_at
    )
    SELECT
      id, task_id, type, from_date, to_date, from_placement_type,
      from_priority, from_carry_over_order, previous_updated_at, NULL, occurred_at
    FROM task_events;

    DROP TABLE task_events;

    ALTER TABLE task_events_next RENAME TO task_events;

    CREATE INDEX task_events_arrival_idx ON task_events (task_id, to_date, occurred_at);
    CREATE INDEX task_events_latest_idx ON task_events (task_id, occurred_at);

    CREATE TABLE reminder_schedules (
      task_id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('notScheduled', 'scheduled', 'permissionDenied', 'failed')
      ),
      notification_id TEXT,
      fire_at TEXT,
      fingerprint TEXT,
      scheduled_at TEXT,
      error TEXT,
      updated_at TEXT NOT NULL,
      CHECK ((status = 'scheduled') = (notification_id IS NOT NULL AND scheduled_at IS NOT NULL))
    );

    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE notification_responses (
      response_id TEXT PRIMARY KEY NOT NULL,
      action TEXT NOT NULL,
      task_id TEXT,
      processed_at TEXT NOT NULL
    );
  `);
};

export const migrations: readonly Migration[] = [
  createTasksSchema,
  addCompletionEvents,
  addSoftDeleteAndCheckableThings,
  addCarryOverReturnNotices,
  addReminderScheduling,
];

export async function migrateDatabase(
  db: SqlDatabase,
  pending: readonly Migration[] = migrations,
): Promise<void> {
  await db.exec('PRAGMA journal_mode = WAL');
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  for (let version = currentVersion; version < pending.length; version++) {
    const migration = pending[version];
    if (migration === undefined) {
      break;
    }
    await db.transaction(async (tx) => {
      await migration(tx);
      await tx.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
