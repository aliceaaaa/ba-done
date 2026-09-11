export type SqlValue = string | number | null;

export type SqlExecutor = {
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  get<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
};

export type SqlDatabase = SqlExecutor & {
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
};
