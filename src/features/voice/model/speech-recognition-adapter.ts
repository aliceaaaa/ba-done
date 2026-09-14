import type { VoiceInputMode } from './voice-command';

export type SpeechPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type SpeechPermission = {
  status: SpeechPermissionStatus;
  canAskAgain: boolean;
};

export type SpeechErrorCode =
  | 'permissionDenied'
  | 'unavailable'
  | 'languageNotSupported'
  | 'noSpeech'
  | 'network'
  | 'interrupted'
  | 'audioCapture'
  | 'busy'
  | 'aborted'
  | 'unknown';

export const SPEECH_RECOGNITION_STATES = [
  'idle',
  'requestingPermission',
  'listening',
  'processing',
  'result',
  'cancelled',
  'permissionDenied',
  'unavailable',
  'error',
] as const;
export type SpeechRecognitionState = (typeof SPEECH_RECOGNITION_STATES)[number];

export type StartListeningOptions = {
  locale: string;
  mode: VoiceInputMode;
  contextualStrings?: readonly string[];
};

export type SpeechRecognitionEvents = {
  partialResult: { transcript: string };
  finalResult: { transcript: string; confidence: number | null };
  error: { code: SpeechErrorCode; message: string };
  stateChanged: { state: SpeechRecognitionState };
};

export type SpeechRecognitionEventName = keyof SpeechRecognitionEvents;

export type SpeechRecognitionListener<K extends SpeechRecognitionEventName> = (
  payload: SpeechRecognitionEvents[K],
) => void;

export type SpeechRecognitionAdapter = {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<SpeechPermission>;
  getPermissionStatus(): Promise<SpeechPermission>;
  startListening(options: StartListeningOptions): Promise<void>;
  stopListening(): Promise<void>;
  cancel(): Promise<void>;
  addListener<K extends SpeechRecognitionEventName>(
    event: K,
    listener: SpeechRecognitionListener<K>,
  ): () => void;
};

export type SpeechEventEmitter = {
  emit<K extends SpeechRecognitionEventName>(event: K, payload: SpeechRecognitionEvents[K]): void;
  addListener<K extends SpeechRecognitionEventName>(
    event: K,
    listener: SpeechRecognitionListener<K>,
  ): () => void;
  listenerCount(): number;
};

export function createSpeechEventEmitter(): SpeechEventEmitter {
  const listeners = new Map<SpeechRecognitionEventName, Set<(payload: never) => void>>();
  return {
    emit(event, payload) {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        (listener as SpeechRecognitionListener<typeof event>)(payload);
      }
    },
    addListener(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as (payload: never) => void);
      listeners.set(event, set);
      return () => {
        set.delete(listener as (payload: never) => void);
      };
    },
    listenerCount() {
      return [...listeners.values()].reduce((total, set) => total + set.size, 0);
    },
  };
}
