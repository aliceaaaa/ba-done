import type { SqlExecutor } from '@/database/sql-database';

export type NotificationResponseRepository = {
  has(responseId: string): Promise<boolean>;
  record(responseId: string, action: string, taskId: string | null, at: string): Promise<void>;
};

export function createNotificationResponseRepository(
  db: SqlExecutor,
): NotificationResponseRepository {
  return {
    async has(responseId) {
      const row = await db.get<{ response_id: string }>(
        'SELECT response_id FROM notification_responses WHERE response_id = ?',
        [responseId],
      );
      return row !== null;
    },

    async record(responseId, action, taskId, at) {
      await db.run(
        `INSERT OR IGNORE INTO notification_responses (response_id, action, task_id, processed_at)
         VALUES (?, ?, ?, ?)`,
        [responseId, action, taskId, at],
      );
    },
  };
}
