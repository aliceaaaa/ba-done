import {
  SYSTEM_VOICE_TEXT,
  type SystemVoiceEntryAdapter,
  type SystemVoiceEntryOutcome,
} from './system-voice-entry-adapter';
import type { VoiceEntrySource } from './voice-entry-intent';
import {
  payloadFromUrlParams,
  sourceFromUrlParams,
  type VoiceEntryUrlParams,
} from './voice-entry-payload';

export type NativeVoiceEntryItem = {
  source: VoiceEntrySource;
  payload: Record<string, unknown>;
};

export type NativeVoiceEntryBridge = {
  isAvailable(): boolean;
  pendingCount(): number;
  consume(): NativeVoiceEntryItem[];
  subscribe(listener: () => void): () => void;
};

export type VoiceEntryInboxState = {
  processing: boolean;
};

export type VoiceEntryInbox = {
  getState(): VoiceEntryInboxState;
  subscribe(listener: (state: VoiceEntryInboxState) => void): () => void;
  onOutcome(listener: (outcome: SystemVoiceEntryOutcome) => void): () => void;
  drainNative(): Promise<SystemVoiceEntryOutcome[]>;
  receiveDeepLink(params: VoiceEntryUrlParams): Promise<SystemVoiceEntryOutcome>;
  receive(payload: unknown, source: VoiceEntrySource): Promise<SystemVoiceEntryOutcome>;
  start(): () => void;
};

export const NULL_NATIVE_VOICE_ENTRY_BRIDGE: NativeVoiceEntryBridge = {
  isAvailable: () => false,
  pendingCount: () => 0,
  consume: () => [],
  subscribe: () => () => undefined,
};

export function createVoiceEntryInbox(
  adapter: SystemVoiceEntryAdapter,
  bridge: NativeVoiceEntryBridge = NULL_NATIVE_VOICE_ENTRY_BRIDGE,
): VoiceEntryInbox {
  let pending = 0;
  let chain: Promise<unknown> = Promise.resolve();
  let state: VoiceEntryInboxState = { processing: safePendingCount() > 0 };
  const stateListeners = new Set<(state: VoiceEntryInboxState) => void>();
  const outcomeListeners = new Set<(outcome: SystemVoiceEntryOutcome) => void>();

  function safePendingCount(): number {
    try {
      return bridge.pendingCount();
    } catch {
      return 0;
    }
  }

  function publish() {
    const next = { processing: pending > 0 };
    if (next.processing === state.processing) {
      return;
    }
    state = next;
    for (const listener of [...stateListeners]) {
      listener(state);
    }
  }

  function enqueue(payload: unknown, source: VoiceEntrySource): Promise<SystemVoiceEntryOutcome> {
    pending += 1;
    publish();
    const run = chain.then(() => adapter.receive(payload, source));
    chain = run.catch(() => undefined);
    return run
      .catch((): SystemVoiceEntryOutcome => ({ kind: 'failed', message: SYSTEM_VOICE_TEXT.failed }))
      .then((outcome) => {
        pending -= 1;
        for (const listener of [...outcomeListeners]) {
          listener(outcome);
        }
        publish();
        return outcome;
      });
  }

  const inbox: VoiceEntryInbox = {
    getState() {
      return state;
    },

    subscribe(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },

    onOutcome(listener) {
      outcomeListeners.add(listener);
      return () => {
        outcomeListeners.delete(listener);
      };
    },

    drainNative() {
      let items: NativeVoiceEntryItem[];
      try {
        items = bridge.consume();
      } catch {
        items = [];
      }
      if (items.length === 0) {
        publish();
      }
      return Promise.all(items.map((item) => enqueue(item.payload, item.source)));
    },

    receiveDeepLink(params) {
      return enqueue(payloadFromUrlParams(params), sourceFromUrlParams(params));
    },

    receive(payload, source) {
      return enqueue(payload, source);
    },

    start() {
      const unsubscribe = bridge.subscribe(() => {
        void inbox.drainNative();
      });
      void inbox.drainNative();
      return unsubscribe;
    },
  };

  return inbox;
}
