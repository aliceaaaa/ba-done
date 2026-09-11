import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase, SqlExecutor, SqlValue } from '../sql-database';

export type NodeSqliteDatabase = SqlDatabase & {
  close(): void;
};

export function createNodeSqliteDatabase(path = ':memory:'): NodeSqliteDatabase {
  const db = new DatabaseSync(path);
  let queue: Promise<unknown> = Promise.resolve();

  const executor: SqlExecutor = {
    async run(sql: string, params: readonly SqlValue[] = []) {
      db.prepare(sql).run(...params);
    },
    async get<T>(sql: string, params: readonly SqlValue[] = []) {
      const row = db.prepare(sql).get(...params);
      return row === undefined ? null : (row as unknown as T);
    },
    async all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...params) as unknown as T[];
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };

  return {
    ...executor,
    transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const next = queue.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const value = await work(executor);
          db.exec('COMMIT');
          return value;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      });
      queue = next.catch(() => undefined);
      return next;
    },
    close() {
      db.close();
    },
  };
}
