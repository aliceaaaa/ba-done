import { requireOptionalNativeModule } from 'expo';
import type {
  ExpoSpeechRecognitionErrorCode,
  ExpoSpeechRecognitionModule,
  ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';

import {
  createSpeechEventEmitter,
  type SpeechErrorCode,
  type SpeechPermission,
  type SpeechRecognitionAdapter,
} from '../model/speech-recognition-adapter';

export type NativeSpeechModule = Pick<
  typeof ExpoSpeechRecognitionModule,
  | 'start'
  | 'stop'
  | 'abort'
  | 'getPermissionsAsync'
  | 'requestPermissionsAsync'
  | 'isRecognitionAvailable'
  | 'addListener'
>;

export const NATIVE_SPEECH_MODULE_NAME = 'ExpoSpeechRecognition';

const ERROR_CODES: Record<ExpoSpeechRecognitionErrorCode, SpeechErrorCode> = {
  aborted: 'aborted',
  'audio-capture': 'audioCapture',
  interrupted: 'interrupted',
  'bad-grammar': 'unknown',
  'language-not-supported': 'languageNotSupported',
  network: 'network',
  'no-speech': 'noSpeech',
  'speech-timeout': 'noSpeech',
  'not-allowed': 'permissionDenied',
  'service-not-allowed': 'unavailable',
  busy: 'busy',
  client: 'unknown',
  unknown: 'unknown',
};

const UNAVAILABLE: SpeechPermission = { status: 'denied', canAskAgain: false };

function loadNativeModule(): NativeSpeechModule | null {
  try {
    return requireOptionalNativeModule<NativeSpeechModule>(NATIVE_SPEECH_MODULE_NAME);
  } catch {
    return null;
  }
}

function toPermission(response: {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}): SpeechPermission {
  if (response.granted) {
    return { status: 'granted', canAskAgain: response.canAskAgain };
  }
  return {
    status: response.status === 'undetermined' ? 'undetermined' : 'denied',
    canAskAgain: response.canAskAgain,
  };
}

export function buildNativeStartOptions(
  locale: string,
  contextualStrings: readonly string[] = [],
): ExpoSpeechRecognitionOptions {
  return {
    lang: locale,
    interimResults: true,
    continuous: false,
    maxAlternatives: 1,
    addsPunctuation: false,
    requiresOnDeviceRecognition: false,
    contextualStrings: [...contextualStrings],
    recordingOptions: { persist: false },
    volumeChangeEventOptions: { enabled: false },
  };
}

export function createNativeSpeechRecognitionAdapter(
  load: () => NativeSpeechModule | null = loadNativeModule,
): SpeechRecognitionAdapter {
  const emitter = createSpeechEventEmitter();
  const module = load();

  if (module !== null) {
    module.addListener('start', () => emitter.emit('stateChanged', { state: 'listening' }));
    module.addListener('speechend', () => emitter.emit('stateChanged', { state: 'processing' }));
    module.addListener('end', () => emitter.emit('stateChanged', { state: 'idle' }));
    module.addListener('result', (event) => {
      const [best] = event.results;
      if (best === undefined) {
        return;
      }
      if (event.isFinal) {
        emitter.emit('finalResult', {
          transcript: best.transcript,
          confidence: best.confidence >= 0 ? best.confidence : null,
        });
      } else {
        emitter.emit('partialResult', { transcript: best.transcript });
      }
    });
    module.addListener('nomatch', () =>
      emitter.emit('error', { code: 'noSpeech', message: 'No speech was recognized' }),
    );
    module.addListener('error', (event) =>
      emitter.emit('error', {
        code: ERROR_CODES[event.error] ?? 'unknown',
        message: event.message,
      }),
    );
  }

  return {
    async isAvailable() {
      if (module === null) {
        return false;
      }
      try {
        return module.isRecognitionAvailable();
      } catch {
        return false;
      }
    },

    async getPermissionStatus() {
      return module === null ? UNAVAILABLE : toPermission(await module.getPermissionsAsync());
    },

    async requestPermissions() {
      return module === null ? UNAVAILABLE : toPermission(await module.requestPermissionsAsync());
    },

    async startListening(options) {
      if (module === null) {
        throw new Error('Speech recognition is not available in this build');
      }
      module.start(buildNativeStartOptions(options.locale, options.contextualStrings));
    },

    async stopListening() {
      module?.stop();
    },

    async cancel() {
      module?.abort();
    },

    addListener(event, listener) {
      return emitter.addListener(event, listener);
    },
  };
}
