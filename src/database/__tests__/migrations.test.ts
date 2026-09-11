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
