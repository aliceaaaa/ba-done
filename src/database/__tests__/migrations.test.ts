import { migrateDatabase, migrations, type Migration } from '../migrations';
import { createNodeSqliteDatabase, type NodeSqliteDatabase } from '../testing/node-sqlite-database';

async function userVersion(db: NodeSqliteDatabase): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

async function tableExists(db: NodeSqliteDatabase, name: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  );
  return row !== null;
}

describe('migrateDatabase', () => {
  let db: NodeSqliteDatabase;

  beforeEach(() => {
    db = createNodeSqliteDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('applies all migrations to a fresh database', async () => {
    await migrateDatabase(db);

    expect(await userVersion(db)).toBe(migrations.length);
    expect(await tableExists(db, 'tasks')).toBe(true);
    expect(await tableExists(db, 'task_events')).toBe(true);
  });

  it('is idempotent', async () => {
    await migrateDatabase(db);
    await migrateDatabase(db);

    expect(await userVersion(db)).toBe(migrations.length);
  });

  it('keeps existing postponed events when upgrading the history table', async () => {
    await migrateDatabase(db, migrations.slice(0, 1));
    await db.exec(`
      INSERT INTO tasks
        (id, title, status, scheduled_date, placement_type, carry_over_order, created_at, updated_at)
      VALUES ('t1', 'Task', 'active', '2026-09-12', 'carryOver', 1, 'now', 'now');
      INSERT INTO task_events
        (id, task_id, type, from_date, to_date, from_placement_type, from_priority, occurred_at)
      VALUES ('e1', 't1', 'postponed', '2026-09-11', '2026-09-12', 'ranked', 5, 'now');
    `);

    await migrateDatabase(db);

    expect(await userVersion(db)).toBe(migrations.length);
    expect(
      await db.get<{ id: string; previous_updated_at: string | null }>(
        'SELECT id, previous_updated_at FROM task_events',
      ),
    ).toEqual({ id: 'e1', previous_updated_at: null });
  });

  it('converts stored things to take into checkable items', async () => {
    await migrateDatabase(db, migrations.slice(0, 2));
    await db.exec(`
      INSERT INTO tasks
        (id, title, status, things_to_take, created_at, updated_at)
      VALUES ('t1', 'Trip', 'active', '["passport","tickets"]', 'now', 'now'),
             ('t2', 'Empty', 'active', '[]', 'now', 'now');
    `);

    await migrateDatabase(db);

    const rows = await db.all<{ id: string; things_to_take: string }>(
      'SELECT id, things_to_take FROM tasks ORDER BY id',
    );
    expect(rows.map((row) => [row.id, JSON.parse(row.things_to_take)])).toEqual([
      [
        't1',
        [
          { text: 'passport', checked: false },
          { text: 'tickets', checked: false },
        ],
      ],
      ['t2', []],
    ]);
  });

  it('adds calendar events to an existing database without losing tasks or reminder schedules', async () => {
    await migrateDatabase(db, migrations.slice(0, 5));
    await db.exec(`
      INSERT INTO tasks
        (id, title, status, scheduled_date, placement_type, priority,
         reminder_type, reminder_local_date_time, reminder_time_zone, created_at, updated_at)
      VALUES ('t1', 'Dentist', 'active', '2026-09-11', 'ranked', 5,
         'exact', '2026-09-11T19:30', 'Europe/Berlin', 'now', 'now');
      INSERT INTO reminder_schedules
        (task_id, status, notification_id, fire_at, fingerprint, scheduled_at, error, updated_at)
      VALUES ('t1', 'scheduled', 'task-reminder-t1', '2026-09-11T17:30:00.000Z', 'fp',
         '2026-09-11T08:00:00.000Z', NULL, 'now');
      INSERT INTO notification_responses (response_id, action, task_id, processed_at)
      VALUES ('r1', 'done', 't1', 'now');
    `);

    await migrateDatabase(db);

    expect(await userVersion(db)).toBe(migrations.length);
    expect(await tableExists(db, 'calendar_events')).toBe(true);
    expect(await db.get('SELECT id, title FROM tasks')).toEqual({ id: 't1', title: 'Dentist' });
    expect(
      await db.all('SELECT owner_type, owner_id, status, notification_id FROM reminder_schedules'),
    ).toEqual([
      {
        owner_type: 'task',
        owner_id: 't1',
        status: 'scheduled',
        notification_id: 'task-reminder-t1',
      },
    ]);
    expect(
      await db.all('SELECT response_id, owner_type, owner_id FROM notification_responses'),
    ).toEqual([{ response_id: 'r1', owner_type: 'task', owner_id: 't1' }]);
    expect(await db.all('SELECT id FROM calendar_events')).toEqual([]);
  });

  it('rejects calendar events with an invalid timing at the database level', async () => {
    await migrateDatabase(db);
    const insert = (timing: string) =>
      db.exec(`
        INSERT INTO calendar_events
          (id, title, all_day, start_at, end_at, start_date, end_date, time_zone, created_at, updated_at)
        VALUES ('e1', 'Event', ${timing}, 'Europe/Berlin', 'now', 'now');
      `);

    await expect(
      insert(`0, '2026-09-11T10:00:00.000Z', '2026-09-11T09:00:00.000Z', NULL, NULL`),
    ).rejects.toThrow('CHECK constraint failed');
    await expect(insert(`1, NULL, NULL, '2026-09-12', '2026-09-11'`)).rejects.toThrow(
      'CHECK constraint failed',
    );
    await expect(
      insert(`1, '2026-09-11T10:00:00.000Z', NULL, '2026-09-11', '2026-09-11'`),
    ).rejects.toThrow('CHECK constraint failed');
  });

  it('adds lists to an existing database without touching tasks, events or settings', async () => {
    await migrateDatabase(db, migrations.slice(0, 6));
    await db.exec(`
      INSERT INTO tasks
        (id, title, status, scheduled_date, placement_type, priority, created_at, updated_at)
      VALUES ('t1', 'Dentist', 'active', '2026-09-11', 'ranked', 5, 'now', 'now');
      INSERT INTO calendar_events
        (id, title, all_day, start_date, end_date, time_zone, created_at, updated_at)
      VALUES ('e1', 'Holiday', 1, '2026-09-11', '2026-09-12', 'Europe/Berlin', 'now', 'now');
      INSERT INTO app_settings (key, value) VALUES ('dayPeriodTime.morning', '08:30');
    `);

    await migrateDatabase(db);

    expect(await userVersion(db)).toBe(migrations.length);
    expect(await tableExists(db, 'lists')).toBe(true);
    expect(await tableExists(db, 'list_items')).toBe(true);
    expect(await db.all('SELECT id, priority FROM tasks')).toEqual([{ id: 't1', priority: 5 }]);
    expect(await db.all('SELECT id FROM calendar_events')).toEqual([{ id: 'e1' }]);
    expect(await db.all('SELECT key, value FROM app_settings')).toEqual([
      { key: 'dayPeriodTime.morning', value: '08:30' },
    ]);
    expect(await db.all('SELECT id FROM lists')).toEqual([]);
  });

  it('enforces list and item invariants at the database level', async () => {
    await migrateDatabase(db);
    await db.exec(`
      INSERT INTO lists (id, title, kind, color, icon, created_at, updated_at)
      VALUES ('l1', 'Shopping', 'shopping', 'green', 'cart', 'now', 'now');
      INSERT INTO list_items (id, list_id, title, position, created_at, updated_at)
      VALUES ('i1', 'l1', 'Milk', 1, 'now', 'now');
    `);
    const insertItem = (values: string) =>
      db.exec(`
        INSERT INTO list_items
          (id, list_id, title, quantity, checked, position, checked_at, created_at, updated_at)
        VALUES (${values}, 'now', 'now');
      `);

    await expect(
      db.exec(`INSERT INTO lists (id, title, kind, color, icon, created_at, updated_at)
               VALUES ('l2', '  ', 'custom', 'blue', 'star', 'now', 'now')`),
    ).rejects.toThrow('CHECK constraint failed');
    await expect(insertItem(`'i2', 'l1', 'Bread', NULL, 0, 1, NULL`)).rejects.toThrow(
      'UNIQUE constraint failed',
    );
    await expect(insertItem(`'i3', 'l1', 'Eggs', 0, 0, 2, NULL`)).rejects.toThrow(
      'CHECK constraint failed',
    );
    await expect(insertItem(`'i4', 'l1', 'Tea', NULL, 1, 1, NULL`)).rejects.toThrow(
      'CHECK constraint failed',
    );
    await expect(insertItem(`'i5', 'l1', 'Tea', NULL, 1, 1, 'now'`)).resolves.toBeUndefined();
  });

  it('rolls back a failing migration', async () => {
    const failing: Migration = async (tx) => {
      await tx.exec('CREATE TABLE broken (id INTEGER)');
      throw new Error('boom');
    };

    await expect(migrateDatabase(db, [...migrations, failing])).rejects.toThrow('boom');

    expect(await userVersion(db)).toBe(migrations.length);
    expect(await tableExists(db, 'broken')).toBe(false);
  });
});
