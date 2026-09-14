import type {
  SpeechErrorCode,
  SpeechRecognitionAdapter,
  SpeechRecognitionState,
} from './speech-recognition-adapter';
import type { VoiceInputMode } from './voice-command';

export type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export type AppStateSource = {
  currentState(): AppStateStatus;
  subscribe(listener: (state: AppStateStatus) => void): () => void;
};

export type VoiceInputState = {
  status: SpeechRecognitionState;
  mode: VoiceInputMode | null;
  sessionId: number;
  partialTranscript: string;
  errorCode: SpeechErrorCode | null;
};

export type VoiceSessionResult = {
  sessionId: number;
  mode: VoiceInputMode;
  transcript: string;
  confidence: number | null;
};

export type VoiceSessionEndReason =
  | 'result'
  | 'noResult'
  | 'cancelled'
  | 'replaced'
  | 'background'
  | 'error'
  | 'permissionDenied'
  | 'unavailable';

export type VoiceSessionEnd = {
  sessionId: number;
  mode: VoiceInputMode;
  reason: VoiceSessionEndReason;
  errorCode: SpeechErrorCode | null;
};

export type StartOutcome =
  'started' | 'alreadyActive' | 'permissionDenied' | 'unavailable' | 'notForeground' | 'error';

export type VoiceInputController = {
  getState(): VoiceInputState;
  subscribe(listener: (state: VoiceInputState) => void): () => void;
  onResult(listener: (result: VoiceSessionResult) => void): () => void;
  onSessionEnd(listener: (end: VoiceSessionEnd) => void): () => void;
  start(mode: VoiceInputMode): Promise<StartOutcome>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
  dispose(): void;
};

export type VoiceInputControllerDeps = {
  adapter: SpeechRecognitionAdapter;
  appState: AppStateSource;
  getLocale: () => string;
  contextualStrings?: () => readonly string[];
};

const ACTIVE_STATES: readonly SpeechRecognitionState[] = [
  'requestingPermission',
  'listening',
  'processing',
];

type Session = {
  id: number;
  mode: VoiceInputMode;
  finished: boolean;
};

export function isActiveVoiceState(status: SpeechRecognitionState): boolean {
  return ACTIVE_STATES.includes(status);
}

export function createVoiceInputController({
  adapter,
  appState,
  getLocale,
  contextualStrings = () => [],
}: VoiceInputControllerDeps): VoiceInputController {
  let state: VoiceInputState = {
    status: 'idle',
    mode: null,
    sessionId: 0,
    partialTranscript: '',
    errorCode: null,
  };
  let session: Session | null = null;
  const stateListeners = new Set<(state: VoiceInputState) => void>();
  const resultListeners = new Set<(result: VoiceSessionResult) => void>();
  const endListeners = new Set<(end: VoiceSessionEnd) => void>();

  function setState(patch: Partial<VoiceInputState>) {
    state = { ...state, ...patch };
    for (const listener of [...stateListeners]) {
      listener(state);
    }
  }

  function finish(
    current: Session,
    status: SpeechRecognitionState,
    reason: VoiceSessionEndReason,
    errorCode: SpeechErrorCode | null = null,
  ) {
    if (current.finished) {
      return;
    }
    current.finished = true;
    if (session?.id === current.id) {
      setState({ status, errorCode });
    }
    const end: VoiceSessionEnd = { sessionId: current.id, mode: current.mode, reason, errorCode };
    for (const listener of [...endListeners]) {
      listener(end);
    }
  }

  function activeSession(): Session | null {
    return session !== null && !session.finished ? session : null;
  }

  async function abort(reason: 'cancelled' | 'replaced' | 'background') {
    const current = activeSession();
    if (current === null) {
      return;
    }
    finish(current, 'cancelled', reason);
    await adapter.cancel();
  }

  const subscriptions = [
    adapter.addListener('partialResult', ({ transcript }) => {
      const current = activeSession();
      if (current !== null && state.status !== 'requestingPermission') {
        setState({ partialTranscript: transcript });
      }
    }),
    adapter.addListener('finalResult', ({ transcript, confidence }) => {
      const current = activeSession();
      if (current === null || state.status === 'requestingPermission') {
        return;
      }
      const text = transcript.trim();
      if (text.length === 0) {
        finish(current, 'idle', 'noResult');
        return;
      }
      setState({ partialTranscript: text });
      finish(current, 'result', 'result');
      const result: VoiceSessionResult = {
        sessionId: current.id,
        mode: current.mode,
        transcript: text,
        confidence,
      };
      for (const listener of [...resultListeners]) {
        listener(result);
      }
    }),
    adapter.addListener('error', ({ code }) => {
      const current = activeSession();
      if (current === null || code === 'aborted') {
        return;
      }
      if (code === 'permissionDenied') {
        finish(current, 'permissionDenied', 'permissionDenied', code);
      } else if (code === 'unavailable' || code === 'languageNotSupported') {
        finish(current, 'unavailable', 'unavailable', code);
      } else if (code === 'noSpeech') {
        finish(current, 'idle', 'noResult', code);
      } else {
        finish(current, 'error', 'error', code);
      }
    }),
    adapter.addListener('stateChanged', ({ state: next }) => {
      const current = activeSession();
      if (current === null) {
        return;
      }
      if (next === 'processing' && state.status === 'listening') {
        setState({ status: 'processing' });
      }
      if (next === 'idle' && state.status !== 'requestingPermission') {
        finish(current, 'idle', 'noResult');
      }
    }),
    appState.subscribe((next) => {
      const current = activeSession();
      if (current === null) {
        return;
      }
      if (
        next === 'background' ||
        (next === 'inactive' && state.status !== 'requestingPermission')
      ) {
        void abort('background');
      }
    }),
  ];

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },

    onResult(listener) {
      resultListeners.add(listener);
      return () => {
        resultListeners.delete(listener);
      };
    },

    onSessionEnd(listener) {
      endListeners.add(listener);
      return () => {
        endListeners.delete(listener);
      };
    },

    async start(mode) {
      const running = activeSession();
      if (running !== null) {
        if (running.mode === 'handsFree' && mode === 'manual') {
          await abort('replaced');
        } else {
          return 'alreadyActive';
        }
      }
      if (appState.currentState() !== 'active') {
        return 'notForeground';
      }
      const current: Session = { id: state.sessionId + 1, mode, finished: false };
      session = current;
      setState({
        status: 'requestingPermission',
        mode,
        sessionId: current.id,
        partialTranscript: '',
        errorCode: null,
      });

      try {
        if (!(await adapter.isAvailable())) {
          finish(current, 'unavailable', 'unavailable', 'unavailable');
          return 'unavailable';
        }
        let permission = await adapter.getPermissionStatus();
        if (permission.status !== 'granted' && permission.canAskAgain) {
          permission = await adapter.requestPermissions();
        }
        if (current.finished) {
          return 'error';
        }
        if (permission.status !== 'granted') {
          finish(current, 'permissionDenied', 'permissionDenied', 'permissionDenied');
          return 'permissionDenied';
        }
        if (appState.currentState() !== 'active') {
          finish(current, 'cancelled', 'background');
          return 'notForeground';
        }
        setState({ status: 'listening' });
        await adapter.startListening({
          locale: getLocale(),
          mode,
          contextualStrings: contextualStrings(),
        });
        return current.finished && state.status === 'unavailable' ? 'unavailable' : 'started';
      } catch {
        finish(current, 'error', 'error', 'unknown');
        return 'error';
      }
    },

    async stop() {
      const current = activeSession();
      if (current === null || state.status !== 'listening') {
        return;
      }
      setState({ status: 'processing' });
      await adapter.stopListening();
    },

    cancel() {
      return abort('cancelled');
    },

    reset() {
      if (activeSession() === null) {
        setState({ status: 'idle', mode: null, partialTranscript: '', errorCode: null });
      }
    },

    dispose() {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
      stateListeners.clear();
      resultListeners.clear();
      endListeners.clear();
    },
  };
}
