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
