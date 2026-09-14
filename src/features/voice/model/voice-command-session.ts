import { VOICE_CONFIG } from '@/shared/config/voice-config';

import { canExecuteImmediately } from './voice-command-policy';
import type {
  VoiceCommandDraft,
  VoiceCommandHint,
  VoiceInputMode,
  VoiceLanguage,
  VoiceListOption,
} from './voice-command';
import type { VoiceCommandExecutor, VoiceDestination, VoiceUndo } from './voice-command-executor';
import { parseVoiceCommand } from './voice-command-parser';
import { saveInputFromDraft } from './voice-save-input';

export const VOICE_UNDO_FAILED = 'Could not undo';

export type PendingVoiceCommand = {
  commandId: string;
  draft: VoiceCommandDraft;
  hint: VoiceCommandHint;
  error: string | null;
};

export type VoiceNotice = {
  id: number;
  message: string;
  undo: VoiceUndo | null;
  destination: VoiceDestination | null;
};

export type VoiceCommandSessionState = {
  pending: PendingVoiceCommand | null;
  notice: VoiceNotice | null;
};

export type TranscriptOutcome = 'ignored' | 'executed' | 'preview' | 'duplicate';

export type VoiceCommandSession = {
  getState(): VoiceCommandSessionState;
  subscribe(listener: (state: VoiceCommandSessionState) => void): () => void;
  handleTranscript(input: {
    sessionId: number;
    transcript: string;
    confidence: number | null;
    mode: VoiceInputMode;
    hint: VoiceCommandHint;
  }): Promise<TranscriptOutcome>;
  closePreview(): void;
  showNotice(notice: Omit<VoiceNotice, 'id'>): void;
  dismissNotice(): void;
  undoNotice(): Promise<boolean>;
  clearHistory(): void;
  hasHistory(): boolean;
};

export type VoiceCommandSessionDeps = {
  executor: VoiceCommandExecutor;
  loadLists: () => Promise<VoiceListOption[]>;
  now: () => Date;
  timeZone: () => string;
  preferredLanguage: () => VoiceLanguage;
  wakePhrases?: readonly { phrase: string }[];
};

export function createVoiceCommandSession({
  executor,
  loadLists,
  now,
  timeZone,
  preferredLanguage,
  wakePhrases = VOICE_CONFIG.wakePhrases,
}: VoiceCommandSessionDeps): VoiceCommandSession {
  let state: VoiceCommandSessionState = { pending: null, notice: null };
  let noticeCounter = 0;
  const handledSessions = new Set<number>();
  const listeners = new Set<(state: VoiceCommandSessionState) => void>();

  function setState(patch: Partial<VoiceCommandSessionState>) {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) {
      listener(state);
    }
  }

  function showNotice(notice: Omit<VoiceNotice, 'id'>) {
    noticeCounter += 1;
    setState({ notice: { ...notice, id: noticeCounter } });
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async handleTranscript({ sessionId, transcript, confidence, mode, hint }) {
      if (handledSessions.has(sessionId)) {
        return 'duplicate';
      }
      handledSessions.add(sessionId);
      const lists = await loadLists().catch(() => []);
      const outcome = parseVoiceCommand(transcript, {
        now: now(),
        timeZone: timeZone(),
        mode,
        wakePhrases,
        hint,
        lists,
        preferredLanguage: preferredLanguage(),
        ...(confidence === null ? {} : { speechConfidence: confidence }),
      });
      if (outcome.status === 'ignored') {
        return 'ignored';
      }
      const commandId = `voice-${sessionId}`;
      const { draft } = outcome;
      const input = saveInputFromDraft(draft);
      if (canExecuteImmediately(draft) && input !== null) {
        const result = await executor.execute(commandId, input);
        if (result.ok) {
          showNotice({
            message: result.message,
            undo: result.undo,
            destination: result.destination,
          });
          return 'executed';
        }
        setState({ pending: { commandId, draft, hint, error: result.message } });
        return 'preview';
      }
      setState({ pending: { commandId, draft, hint, error: null } });
      return 'preview';
    },

    closePreview() {
      setState({ pending: null });
    },

    showNotice,

    dismissNotice() {
      setState({ notice: null });
    },

    async undoNotice() {
      const { notice } = state;
      if (notice === null || notice.undo === null) {
        return false;
      }
      const undone = await executor.undo(notice.undo);
      if (undone) {
        setState({ notice: null });
      } else {
        showNotice({ message: VOICE_UNDO_FAILED, undo: null, destination: notice.destination });
      }
      return undone;
    },

    clearHistory() {
      setState({ pending: null, notice: null });
    },

    hasHistory() {
      return state.pending !== null;
    },
  };
}
