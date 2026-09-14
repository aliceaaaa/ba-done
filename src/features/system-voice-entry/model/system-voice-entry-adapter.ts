import type { ListService } from '@/entities/list';
import {
  canExecuteImmediately,
  saveInputFromDraft,
  type VoiceCommandDraft,
  type VoiceCommandExecutor,
  type VoiceCommandHint,
  type VoiceCommandSession,
  type VoiceDestination,
  type VoiceLanguage,
  type VoiceListOption,
  type VoiceUndo,
} from '@/features/voice';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { toLocalDate } from '@/shared/lib/local-date';

import type {
  VoiceEntryEntityKind,
  VoiceEntryIntentRepository,
} from '../api/voice-entry-intent-repository';
import { buildDraftFromVoiceEntry } from './voice-entry-draft';
import { isTrustedVoiceEntry, type VoiceEntryIntent, type VoiceEntrySource } from './voice-entry-intent';
import { parseVoiceEntryPayload } from './voice-entry-payload';

export const SYSTEM_VOICE_TEXT = {
  processing: 'Processing voice command',
  savedToFuture: 'Saved to Future',
  addedToMatches: `Added to ${UI_STRINGS.todayList}`,
  addedToCalendar: 'Added to Calendar',
  needsInput: 'I need a little more information',
  notUnderstood: 'Couldn’t understand that command',
  failed: 'Couldn’t save that command. Nothing was changed.',
  undoFailed: 'Could not undo',
} as const;

export function savedToListMessage(listTitle: string): string {
  return `Saved to ${listTitle}`;
}

export type SystemVoiceEntryOutcome =
  | { kind: 'rejected'; message: string }
  | { kind: 'duplicate' }
  | { kind: 'navigate'; destination: VoiceDestination }
  | { kind: 'startVoiceCapture'; hint: VoiceCommandHint }
  | { kind: 'saved'; intentId: string; message: string; destination: VoiceDestination }
  | { kind: 'needsInput'; intentId: string; message: string }
  | { kind: 'failed'; message: string };

export type SystemVoiceEntryAdapter = {
  receive(raw: unknown, source: VoiceEntrySource): Promise<SystemVoiceEntryOutcome>;
  undo(intentId: string): Promise<boolean>;
};

export type SystemVoiceEntryAdapterDeps = {
  repository: VoiceEntryIntentRepository;
  executor: VoiceCommandExecutor;
  session: VoiceCommandSession;
  lists: Pick<ListService, 'getLists'>;
  now: () => Date;
  timeZone: () => string;
  generateId: () => string;
  preferredLanguage: () => VoiceLanguage;
};

function entityOf(undo: VoiceUndo | null): { kind: VoiceEntryEntityKind; id: string } | undefined {
  return undo === null ? undefined : { kind: undo.kind, id: undo.id };
}

function undoFromRecord(kind: VoiceEntryEntityKind, id: string): VoiceUndo {
  return { kind, id };
}

export function canSystemEntrySaveImmediately(
  intent: VoiceEntryIntent,
  draft: VoiceCommandDraft,
  today: string,
): boolean {
  if (!isTrustedVoiceEntry(intent)) {
    return false;
  }
  if (draft.missingFields.length > 0 || draft.ambiguities.length > 0 || draft.title === null) {
    return false;
  }
  switch (draft.kind) {
    case 'listItem':
    case 'futureTask':
      return canExecuteImmediately(draft);
    case 'rankedTask':
      return (
        draft.date !== null && draft.date >= today && draft.priority !== null && draft.reminder === null
      );
    case 'calendarEvent':
      return draft.date !== null && draft.date >= today && draft.eventEnd !== null;
    case 'unknown':
      return false;
  }
}

function hintForPreview(draft: VoiceCommandDraft, today: string): VoiceCommandHint {
  switch (draft.kind) {
    case 'futureTask':
      return { kind: 'futureTask' };
    case 'rankedTask':
      return { kind: 'rankedTask', date: draft.date ?? today };
    case 'calendarEvent':
      return { kind: 'calendar', date: draft.date ?? today };
    default:
      return { kind: 'none' };
  }
}

function savedMessage(draft: VoiceCommandDraft, lists: readonly VoiceListOption[]): string {
  switch (draft.kind) {
    case 'listItem': {
      const title = lists.find((list) => list.id === draft.targetListId)?.title;
      return savedToListMessage(title ?? draft.targetListName ?? 'your list');
    }
    case 'futureTask':
      return SYSTEM_VOICE_TEXT.savedToFuture;
    case 'rankedTask':
      return SYSTEM_VOICE_TEXT.addedToMatches;
    default:
      return SYSTEM_VOICE_TEXT.addedToCalendar;
  }
}

export function createSystemVoiceEntryAdapter(
  deps: SystemVoiceEntryAdapterDeps,
): SystemVoiceEntryAdapter {
  const inFlight = new Map<string, Promise<SystemVoiceEntryOutcome>>();
  const undoing = new Map<string, Promise<boolean>>();

  async function loadLists(): Promise<VoiceListOption[]> {
    try {
      return (await deps.lists.getLists()).map((list) => ({
        id: list.id,
        title: list.title,
        kind: list.kind,
      }));
    } catch {
      return [];
    }
  }

  async function finish(
    intent: VoiceEntryIntent,
    outcome: SystemVoiceEntryOutcome,
    entity?: { kind: VoiceEntryEntityKind; id: string },
  ): Promise<SystemVoiceEntryOutcome> {
    const status =
      outcome.kind === 'saved'
        ? 'saved'
        : outcome.kind === 'needsInput'
          ? 'needsInput'
          : outcome.kind === 'failed'
            ? 'failed'
            : 'navigated';
    try {
      await deps.repository.finish(intent.id, status, deps.now().toISOString(), entity);
    } catch {
      return outcome;
    }
    return outcome;
  }

  function openPreview(
    intent: VoiceEntryIntent,
    draft: VoiceCommandDraft,
    today: string,
    error: string | null,
  ): SystemVoiceEntryOutcome {
    deps.session.openPreview({
      commandId: `system-${intent.id}`,
      draft,
      hint: hintForPreview(draft, today),
      error,
      intro: SYSTEM_VOICE_TEXT.needsInput,
    });
    return { kind: 'needsInput', intentId: intent.id, message: SYSTEM_VOICE_TEXT.needsInput };
  }

  async function process(intent: VoiceEntryIntent): Promise<SystemVoiceEntryOutcome> {
    const now = deps.now();
    const today = toLocalDate(now, deps.timeZone());
    if (intent.action === 'openToday') {
      return finish(intent, { kind: 'navigate', destination: { screen: 'matches', date: today } });
    }
    if (intent.action === 'openVoiceCapture') {
      return finish(intent, { kind: 'startVoiceCapture', hint: { kind: 'rankedTask', date: today } });
    }
    const lists = await loadLists();
    const draft = buildDraftFromVoiceEntry(intent, {
      now,
      timeZone: deps.timeZone(),
      lists,
      preferredLanguage: deps.preferredLanguage(),
    });
    if (draft === null) {
      return finish(intent, { kind: 'rejected', message: SYSTEM_VOICE_TEXT.notUnderstood });
    }
    const input = saveInputFromDraft(draft);
    if (!canSystemEntrySaveImmediately(intent, draft, today) || input === null) {
      return finish(intent, openPreview(intent, draft, today, null));
    }
    const result = await deps.executor.execute(`system-${intent.id}`, input);
    if (result.ok) {
      const outcome: SystemVoiceEntryOutcome = {
        kind: 'saved',
        intentId: intent.id,
        message: savedMessage(draft, lists),
        destination: result.destination,
      };
      deps.session.showNotice({
        message: outcome.message,
        undo: result.undo,
        destination: null,
        undoHandler: () => adapter.undo(intent.id),
      });
      return finish(intent, outcome, entityOf(result.undo));
    }
    if (result.reason === 'storage') {
      return finish(intent, { kind: 'failed', message: SYSTEM_VOICE_TEXT.failed });
    }
    return finish(intent, openPreview(intent, draft, today, result.message));
  }

  const adapter: SystemVoiceEntryAdapter = {
    async receive(raw, source) {
      const parsed = parseVoiceEntryPayload(raw, {
        source,
        now: deps.now(),
        generateId: deps.generateId,
      });
      if (!parsed.ok) {
        return { kind: 'rejected', message: SYSTEM_VOICE_TEXT.notUnderstood };
      }
      const intent = parsed.value;
      const running = inFlight.get(intent.id);
      if (running !== undefined) {
        return { kind: 'duplicate' };
      }
      const work = (async (): Promise<SystemVoiceEntryOutcome> => {
        let claimed: boolean;
        try {
          claimed = await deps.repository.claim(intent);
        } catch {
          return { kind: 'failed', message: SYSTEM_VOICE_TEXT.failed };
        }
        if (!claimed) {
          return { kind: 'duplicate' };
        }
        try {
          return await process(intent);
        } catch {
          return finish(intent, { kind: 'failed', message: SYSTEM_VOICE_TEXT.failed });
        }
      })();
      inFlight.set(intent.id, work);
      try {
        return await work;
      } finally {
        inFlight.delete(intent.id);
      }
    },

    undo(intentId) {
      const running = undoing.get(intentId);
      if (running !== undefined) {
        return running;
      }
      const work = (async () => {
        try {
          const record = await deps.repository.find(intentId);
          if (record === null || record.entityKind === null || record.entityId === null) {
            return false;
          }
          if (record.undoneAt !== null) {
            return true;
          }
          const undone = await deps.executor.undo(undoFromRecord(record.entityKind, record.entityId));
          if (undone) {
            await deps.repository.markUndone(intentId, deps.now().toISOString());
          }
          return undone;
        } catch {
          return false;
        }
      })();
      undoing.set(intentId, work);
      void work.finally(() => undoing.delete(intentId));
      return work;
    },
  };

  return adapter;
}
