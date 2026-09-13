import type { SqlExecutor } from '@/database/sql-database';

import type { ReminderOwner } from '../model/types';

export type NotificationResponseRepository = {
  has(responseId: string): Promise<boolean>;
  record(
    responseId: string,
    action: string,
    owner: ReminderOwner | null,
    at: string,
  ): Promise<void>;
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

    async record(responseId, action, owner, at) {
      await db.run(
        `INSERT OR IGNORE INTO notification_responses
           (response_id, action, owner_type, owner_id, processed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [responseId, action, owner?.ownerType ?? null, owner?.ownerId ?? null, at],
      );
    },
  };
}
