import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  buildNativeStartOptions,
  createNativeSpeechRecognitionAdapter,
  type NativeSpeechModule,
} from '../api/native-speech-recognition-adapter';
import {
  createVoiceInputController,
  type VoiceInputController,
  type VoiceSessionEnd,
  type VoiceSessionResult,
} from '../model/voice-input-controller';
import { createFakeAppState, type FakeAppState } from '../testing/fake-app-state';
import {
  SPEECH_DENIED,
  SPEECH_GRANTED,
  createFakeSpeechRecognitionAdapter,
  type FakeSpeechRecognitionAdapter,
} from '../testing/fake-speech-recognition-adapter';

describe('VoiceInputController', () => {
  let adapter: FakeSpeechRecognitionAdapter;
  let appState: FakeAppState;
  let controller: VoiceInputController;
  let results: VoiceSessionResult[];
  let ends: VoiceSessionEnd[];
  let locale: string;

  beforeEach(() => {
    adapter = createFakeSpeechRecognitionAdapter();
    appState = createFakeAppState();
    locale = 'en-US';
    controller = createVoiceInputController({ adapter, appState, getLocale: () => locale });
    results = [];
    ends = [];
    controller.onResult((result) => results.push(result));
    controller.onSessionEnd((end) => ends.push(end));
  });

  afterEach(() => {
    controller.dispose();
  });

  it('requests permission only when listening starts and listens once granted', async () => {
    const statuses: string[] = [];
    controller.subscribe((state) => statuses.push(state.status));
    expect(adapter.calls.request).toBe(0);

    expect(await controller.start('manual')).toBe('started');

    expect(adapter.calls.request).toBe(1);
    expect(statuses).toEqual(['requestingPermission', 'listening']);
    expect(adapter.calls.start).toEqual([
      { locale: 'en-US', mode: 'manual', contextualStrings: [] },
    ]);
  });

  it('does not request again when permission is already granted', async () => {
    adapter.setPermission(SPEECH_GRANTED);

    await controller.start('manual');

    expect(adapter.calls.request).toBe(0);
    expect(controller.getState().status).toBe('listening');
  });

  it('reports a denied permission without starting recognition', async () => {
    adapter.setRequestResult(SPEECH_DENIED);

    expect(await controller.start('manual')).toBe('permissionDenied');

    expect(controller.getState()).toMatchObject({ status: 'permissionDenied' });
    expect(adapter.calls.start).toEqual([]);
    expect(ends).toEqual([expect.objectContaining({ reason: 'permissionDenied' })]);

    adapter.setPermission(SPEECH_DENIED);
    expect(await controller.start('manual')).toBe('permissionDenied');
    expect(adapter.calls.request).toBe(1);
  });

  it('treats an unavailable recognition service as a normal state', async () => {
    adapter.setAvailable(false);

    expect(await controller.start('manual')).toBe('unavailable');

    expect(controller.getState().status).toBe('unavailable');
    expect(adapter.calls.request).toBe(0);
    expect(adapter.calls.start).toEqual([]);
  });

  it('publishes partial results while listening', async () => {
    await controller.start('manual');

    adapter.emitPartial('add mi');
    adapter.emitPartial('add milk');

    expect(controller.getState()).toMatchObject({
      status: 'listening',
      partialTranscript: 'add milk',
    });
    expect(results).toEqual([]);
  });

  it('delivers the final result once and ignores a repeated callback', async () => {
    await controller.start('manual');

    adapter.emitFinal('add milk to Shopping', 0.8);
    adapter.emitFinal('add milk to Shopping', 0.8);
    adapter.emitEnd();

    expect(results).toEqual([
      { sessionId: 1, mode: 'manual', transcript: 'add milk to Shopping', confidence: 0.8 },
    ]);
    expect(controller.getState().status).toBe('result');
    expect(ends).toEqual([expect.objectContaining({ reason: 'result' })]);
  });

  it('moves to processing when the user stops listening', async () => {
    await controller.start('manual');

    await controller.stop();

    expect(controller.getState().status).toBe('processing');
    expect(adapter.calls.stop).toBe(1);
  });

  it('cancels a session and drops later results', async () => {
    await controller.start('manual');

    await controller.cancel();
    adapter.emitFinal('add milk');

    expect(controller.getState().status).toBe('cancelled');
    expect(adapter.calls.cancel).toBe(1);
    expect(results).toEqual([]);
    expect(ends).toEqual([expect.objectContaining({ reason: 'cancelled' })]);
  });

  it('maps a system error to the error state', async () => {
    await controller.start('manual');

    adapter.emitError('network', 'The network connection was lost');

    expect(controller.getState()).toMatchObject({ status: 'error', errorCode: 'network' });
    expect(ends).toEqual([expect.objectContaining({ reason: 'error', errorCode: 'network' })]);
  });

  it('turns a failing native start into the error state instead of throwing', async () => {
    adapter.setPermission(SPEECH_GRANTED);
    adapter.failNextStart('Recognizer is busy');

    expect(await controller.start('manual')).toBe('error');
    expect(controller.getState().status).toBe('error');
  });

  it('does not create a second session when start is pressed while listening', async () => {
    await controller.start('manual');

    expect(await controller.start('manual')).toBe('alreadyActive');
    expect(await controller.start('handsFree')).toBe('alreadyActive');

    expect(adapter.calls.start).toHaveLength(1);
    expect(controller.getState().sessionId).toBe(1);
  });

  it('lets a manual press replace a hands-free session', async () => {
    await controller.start('handsFree');

    expect(await controller.start('manual')).toBe('started');

    expect(adapter.calls.cancel).toBe(1);
    expect(adapter.calls.start.map((call) => call.mode)).toEqual(['handsFree', 'manual']);
    expect(ends).toEqual([expect.objectContaining({ mode: 'handsFree', reason: 'replaced' })]);
  });

  it('stops listening immediately when the app goes to the background', async () => {
    await controller.start('manual');

    appState.set('background');

    expect(adapter.calls.cancel).toBe(1);
    expect(controller.getState().status).toBe('cancelled');
    expect(ends).toEqual([expect.objectContaining({ reason: 'background' })]);
    adapter.emitFinal('add milk');
    expect(results).toEqual([]);
  });

  it('keeps the permission prompt alive while iOS reports the app as inactive', async () => {
    let resolveRequest: (value: typeof SPEECH_GRANTED) => void = () => undefined;
    adapter.requestPermissions = () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      });

    const starting = controller.start('manual');
    await new Promise((resolve) => setImmediate(resolve));
    appState.set('inactive');
    appState.set('active');
    resolveRequest(SPEECH_GRANTED);

    expect(await starting).toBe('started');
  });

  it('does not start while the app is not in the foreground', async () => {
    appState.set('background');

    expect(await controller.start('manual')).toBe('notForeground');
    expect(adapter.calls.start).toEqual([]);
  });

  it('uses the injected recognition locale', async () => {
    locale = 'ru-RU';

    await controller.start('manual');

    expect(adapter.calls.start[0]?.locale).toBe('ru-RU');
  });
});

describe('NativeSpeechRecognitionAdapter', () => {
  type Listener = (event: unknown) => void;

  function createModule() {
    const listeners = new Map<string, Listener[]>();
    const module = {
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
      getPermissionsAsync: jest.fn(async () => ({
        granted: false,
        canAskAgain: true,
        status: 'undetermined',
        expires: 'never',
      })),
      requestPermissionsAsync: jest.fn(async () => ({
        granted: true,
        canAskAgain: true,
        status: 'granted',
        expires: 'never',
      })),
      isRecognitionAvailable: jest.fn(() => true),
      addListener: jest.fn((event: string, listener: Listener) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return { remove: jest.fn() };
      }),
    };
    return {
      module: module as unknown as NativeSpeechModule,
      raw: module,
      emit(event: string, payload: unknown) {
        for (const listener of listeners.get(event) ?? []) {
          listener(payload);
        }
      },
    };
  }

  it('reports unavailable instead of crashing when the native module is missing', async () => {
    const adapter = createNativeSpeechRecognitionAdapter(() => null);

    expect(await adapter.isAvailable()).toBe(false);
    expect(await adapter.getPermissionStatus()).toEqual({ status: 'denied', canAskAgain: false });
    await expect(adapter.startListening({ locale: 'en-US', mode: 'manual' })).rejects.toThrow();
    await expect(adapter.cancel()).resolves.toBeUndefined();
  });

  it('maps permissions and native events', async () => {
    const native = createModule();
    const adapter = createNativeSpeechRecognitionAdapter(() => native.module);
    const events: unknown[] = [];
    adapter.addListener('partialResult', (event) => events.push(['partial', event]));
    adapter.addListener('finalResult', (event) => events.push(['final', event]));
    adapter.addListener('error', (event) => events.push(['error', event]));
    adapter.addListener('stateChanged', (event) => events.push(['state', event]));

    expect(await adapter.getPermissionStatus()).toEqual({
      status: 'undetermined',
      canAskAgain: true,
    });
    expect(await adapter.requestPermissions()).toEqual({ status: 'granted', canAskAgain: true });
    native.emit('start', null);
    native.emit('result', { isFinal: false, results: [{ transcript: 'add', confidence: -1 }] });
    native.emit('result', {
      isFinal: true,
      results: [{ transcript: 'add milk', confidence: 0.7 }],
    });
    native.emit('error', { error: 'service-not-allowed', message: 'Disabled' });
    native.emit('end', null);

    expect(events).toEqual([
      ['state', { state: 'listening' }],
      ['partial', { transcript: 'add' }],
      ['final', { transcript: 'add milk', confidence: 0.7 }],
      ['error', { code: 'unavailable', message: 'Disabled' }],
      ['state', { state: 'idle' }],
    ]);
  });

  it('never asks the system to persist raw audio and ignores audio file events', async () => {
    const native = createModule();
    const adapter = createNativeSpeechRecognitionAdapter(() => native.module);
    const received: unknown[] = [];
    adapter.addListener('finalResult', (event) => received.push(event));
    adapter.addListener('partialResult', (event) => received.push(event));
    adapter.addListener('stateChanged', (event) => received.push(event));

    await adapter.startListening({ locale: 'ru-RU', mode: 'manual' });
    native.emit('audiostart', { uri: 'file:///recording.wav' });
    native.emit('audioend', { uri: 'file:///recording.wav' });

    expect(native.raw.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'ru-RU', recordingOptions: { persist: false } }),
    );
    expect(buildNativeStartOptions('en-US')).not.toHaveProperty('audioSource');
    expect(received).toEqual([]);
    expect(native.raw.addListener.mock.calls.map(([event]) => event)).not.toContain('audioend');
  });

  it('does not reference file storage or recording APIs in the voice feature', () => {
    const root = path.resolve(__dirname, '..');
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== '__tests__') {
          walk(full);
        } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
          sources.push(fs.readFileSync(full, 'utf8'));
        }
      }
    };
    walk(root);

    const code = sources.join('\n');
    expect(code).not.toMatch(/expo-file-system|expo-audio|expo-av|persist:\s*true|outputDirectory/);
  });
});
