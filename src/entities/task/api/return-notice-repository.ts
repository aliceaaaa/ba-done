import type { SqlExecutor } from '@/database/sql-database';

export type ReturnNoticeRepository = {
  listUnshown(scheduledDate: string): Promise<string[]>;
  markShown(taskId: string, scheduledDate: string, shownAt: string): Promise<void>;
};

export function createReturnNoticeRepository(db: SqlExecutor): ReturnNoticeRepository {
  return {
    async listUnshown(scheduledDate) {
      const rows = await db.all<{ id: string }>(
        `SELECT t.id FROM tasks t
         WHERE t.scheduled_date = ?
           AND t.status = 'active'
           AND t.placement_type = 'carryOver'
           AND t.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM carry_over_return_notices n
             WHERE n.task_id = t.id AND n.scheduled_date = t.scheduled_date
           )
         ORDER BY t.carry_over_order ASC`,
        [scheduledDate],
      );
      return rows.map((row) => row.id);
    },

    async markShown(taskId, scheduledDate, shownAt) {
      await db.run(
        `INSERT OR IGNORE INTO carry_over_return_notices (task_id, scheduled_date, shown_at)
         VALUES (?, ?, ?)`,
        [taskId, scheduledDate, shownAt],
      );
    },
  };
}
