import type { SqlDatabase } from '@/database/sql-database';

import type { VoiceEntryIntent } from '../model/voice-entry-intent';

export type VoiceEntryStatus = 'processing' | 'saved' | 'needsInput' | 'navigated' | 'failed';

export type VoiceEntryEntityKind = 'listItem' | 'list' | 'task' | 'calendarEvent';

export type VoiceEntryRecord = {
  intentId: string;
  status: VoiceEntryStatus;
  entityKind: VoiceEntryEntityKind | null;
  entityId: string | null;
  undoneAt: string | null;
};

type VoiceEntryRow = {
  intent_id: string;
  status: VoiceEntryStatus;
  entity_kind: VoiceEntryEntityKind | null;
  entity_id: string | null;
  undone_at: string | null;
};

export type VoiceEntryIntentRepository = {
  claim(intent: VoiceEntryIntent): Promise<boolean>;
  finish(
    intentId: string,
    status: Exclude<VoiceEntryStatus, 'processing'>,
    finishedAt: string,
    entity?: { kind: VoiceEntryEntityKind; id: string },
  ): Promise<void>;
  find(intentId: string): Promise<VoiceEntryRecord | null>;
  markUndone(intentId: string, undoneAt: string): Promise<boolean>;
};

const RETENTION_MS = 30 * 86_400_000;

function toRecord(row: VoiceEntryRow): VoiceEntryRecord {
  return {
    intentId: row.intent_id,
    status: row.status,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    undoneAt: row.undone_at,
  };
}

export function createVoiceEntryIntentRepository(db: SqlDatabase): VoiceEntryIntentRepository {
  return {
    claim(intent) {
      return db.transaction(async (tx) => {
        const existing = await tx.get<{ intent_id: string }>(
          'SELECT intent_id FROM voice_entry_intents WHERE intent_id = ?',
          [intent.id],
        );
        if (existing !== null) {
          return false;
        }
        const cutoff = new Date(Date.parse(intent.receivedAt) - RETENTION_MS).toISOString();
        await tx.run('DELETE FROM voice_entry_intents WHERE received_at < ?', [cutoff]);
        await tx.run(
          `INSERT INTO voice_entry_intents (intent_id, source, action, status, received_at)
           VALUES (?, ?, ?, 'processing', ?)`,
          [intent.id, intent.source, intent.action, intent.receivedAt],
        );
        return true;
      });
    },

    async finish(intentId, status, finishedAt, entity) {
      await db.run(
        `UPDATE voice_entry_intents
         SET status = ?, finished_at = ?, entity_kind = ?, entity_id = ?
         WHERE intent_id = ?`,
        [status, finishedAt, entity?.kind ?? null, entity?.id ?? null, intentId],
      );
    },

    async find(intentId) {
      const row = await db.get<VoiceEntryRow>(
        `SELECT intent_id, status, entity_kind, entity_id, undone_at
         FROM voice_entry_intents WHERE intent_id = ?`,
        [intentId],
      );
      return row === null ? null : toRecord(row);
    },

    markUndone(intentId, undoneAt) {
      return db.transaction(async (tx) => {
        const row = await tx.get<{ undone_at: string | null; status: string }>(
          'SELECT undone_at, status FROM voice_entry_intents WHERE intent_id = ?',
          [intentId],
        );
        if (row === null || row.status !== 'saved' || row.undone_at !== null) {
          return false;
        }
        await tx.run('UPDATE voice_entry_intents SET undone_at = ? WHERE intent_id = ?', [
          undoneAt,
          intentId,
        ]);
        return true;
      });
    },
  };
}
