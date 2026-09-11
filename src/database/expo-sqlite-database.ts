import type { SQLiteDatabase } from 'expo-sqlite';

import type { SqlDatabase, SqlExecutor, SqlValue } from './sql-database';

function createExecutor(db: SQLiteDatabase): SqlExecutor {
  return {
    async run(sql: string, params: readonly SqlValue[] = []) {
      await db.runAsync(sql, [...params]);
    },
    get<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.getFirstAsync<T>(sql, [...params]);
    },
    all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.getAllAsync<T>(sql, [...params]);
    },
    exec(sql: string) {
      return db.execAsync(sql);
    },
  };
}

export function createExpoSqliteDatabase(db: SQLiteDatabase): SqlDatabase {
  return {
    ...createExecutor(db),
    async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const box: { current: { value: T } | null } = { current: null };
      await db.withExclusiveTransactionAsync(async (txn) => {
        box.current = { value: await work(createExecutor(txn)) };
      });
      if (box.current === null) {
        throw new Error('Transaction finished without a result');
      }
      return box.current.value;
    },
  };
}
