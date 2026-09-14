import {
  createSpeechEventEmitter,
  type SpeechErrorCode,
  type SpeechPermission,
  type SpeechRecognitionAdapter,
  type StartListeningOptions,
} from '../model/speech-recognition-adapter';

export type FakeSpeechRecognitionAdapter = SpeechRecognitionAdapter & {
  calls: {
    start: StartListeningOptions[];
    stop: number;
    cancel: number;
    request: number;
  };
  isListening(): boolean;
  setAvailable(available: boolean): void;
  setPermission(permission: SpeechPermission): void;
  setRequestResult(permission: SpeechPermission): void;
  failNextStart(message: string): void;
  emitPartial(transcript: string): void;
  emitFinal(transcript: string, confidence?: number | null): void;
  emitError(code: SpeechErrorCode, message?: string): void;
  emitEnd(): void;
  listenerCount(): number;
};

export type FakeSpeechOptions = {
  available?: boolean;
  permission?: SpeechPermission;
  requestResult?: SpeechPermission;
};

export const SPEECH_GRANTED: SpeechPermission = { status: 'granted', canAskAgain: true };
export const SPEECH_DENIED: SpeechPermission = { status: 'denied', canAskAgain: false };
export const SPEECH_UNDETERMINED: SpeechPermission = { status: 'undetermined', canAskAgain: true };

export function createFakeSpeechRecognitionAdapter(
  options: FakeSpeechOptions = {},
): FakeSpeechRecognitionAdapter {
  const emitter = createSpeechEventEmitter();
  let available = options.available ?? true;
  let permission = options.permission ?? SPEECH_UNDETERMINED;
  let requestResult = options.requestResult ?? SPEECH_GRANTED;
  let startFailure: string | null = null;
  let listening = false;
  const calls = { start: [] as StartListeningOptions[], stop: 0, cancel: 0, request: 0 };

  return {
    calls,

    async isAvailable() {
      return available;
    },

    async getPermissionStatus() {
      return permission;
    },

    async requestPermissions() {
      calls.request += 1;
      permission = requestResult;
      return permission;
    },

    async startListening(startOptions) {
      calls.start.push(startOptions);
      if (startFailure !== null) {
        const message = startFailure;
        startFailure = null;
        throw new Error(message);
      }
      listening = true;
      emitter.emit('stateChanged', { state: 'listening' });
    },

    async stopListening() {
      calls.stop += 1;
      if (listening) {
        emitter.emit('stateChanged', { state: 'processing' });
      }
    },

    async cancel() {
      calls.cancel += 1;
      if (listening) {
        listening = false;
        emitter.emit('error', { code: 'aborted', message: 'Recognition aborted' });
        emitter.emit('stateChanged', { state: 'idle' });
      }
    },

    addListener(event, listener) {
      return emitter.addListener(event, listener);
    },

    isListening() {
      return listening;
    },

    setAvailable(next) {
      available = next;
    },

    setPermission(next) {
      permission = next;
    },

    setRequestResult(next) {
      requestResult = next;
    },

    failNextStart(message) {
      startFailure = message;
    },

    emitPartial(transcript) {
      emitter.emit('partialResult', { transcript });
    },

    emitFinal(transcript, confidence = 0.9) {
      emitter.emit('finalResult', { transcript, confidence });
    },

    emitError(code, message = 'Recognition error') {
      listening = false;
      emitter.emit('error', { code, message });
      emitter.emit('stateChanged', { state: 'idle' });
    },

    emitEnd() {
      listening = false;
      emitter.emit('stateChanged', { state: 'idle' });
    },

    listenerCount() {
      return emitter.listenerCount();
    },
  };
}
