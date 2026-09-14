import { VOICE_CONFIG } from '@/shared/config/voice-config';

import {
  backoffDelay,
  createHandsFreeController,
  type HandsFreeController,
} from '../model/hands-free-controller';
import { stripWakePhrase } from '../model/voice-command-parser';
import {
  createVoiceInputController,
  type VoiceInputController,
  type VoiceSessionResult,
} from '../model/voice-input-controller';
import {
  createFakeAppState,
  createManualScheduler,
  type FakeAppState,
  type ManualScheduler,
} from '../testing/fake-app-state';
import {
  SPEECH_DENIED,
  SPEECH_GRANTED,
  createFakeSpeechRecognitionAdapter,
  type FakeSpeechRecognitionAdapter,
} from '../testing/fake-speech-recognition-adapter';

const CONFIG = VOICE_CONFIG.handsFree;

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('HandsFreeController', () => {
  let adapter: FakeSpeechRecognitionAdapter;
  let appState: FakeAppState;
  let scheduler: ManualScheduler;
  let controller: VoiceInputController;
  let handsFree: HandsFreeController;
  let commands: VoiceSessionResult[];

  beforeEach(() => {
    adapter = createFakeSpeechRecognitionAdapter({ permission: SPEECH_GRANTED });
    appState = createFakeAppState();
    scheduler = createManualScheduler();
    controller = createVoiceInputController({ adapter, appState, getLocale: () => 'en-US' });
    commands = [];
    handsFree = createHandsFreeController({
      controller,
      appState,
      scheduler,
      config: CONFIG,
      hasWakePhrase: (transcript) => stripWakePhrase(transcript, VOICE_CONFIG.wakePhrases).hadWakePhrase,
      onCommand: (result) => commands.push(result),
    });
  });

  afterEach(() => {
    handsFree.dispose();
    controller.dispose();
  });

  it('is off by default and never listens until it is enabled and confirmed', async () => {
    expect(handsFree.getState().status).toBe('off');
    await handsFree.start();
    expect(adapter.calls.start).toEqual([]);

    handsFree.enable();
    expect(handsFree.getState().status).toBe('awaitingConfirmation');
    expect(adapter.calls.start).toEqual([]);

    await handsFree.start();

    expect(handsFree.getState().status).toBe('waitingForWakePhrase');
    expect(adapter.calls.start.map((call) => call.mode)).toEqual(['handsFree']);
  });

  it('ignores speech without the wake phrase and waits again', async () => {
    handsFree.enable();
    await handsFree.start();

    adapter.emitFinal('add milk to Shopping');

    expect(commands).toEqual([]);
    expect(handsFree.getState()).toMatchObject({ status: 'retrying', retryInMs: CONFIG.restartDelayMs });
    await scheduler.runNext();
    expect(handsFree.getState().status).toBe('waitingForWakePhrase');
    expect(adapter.calls.start).toHaveLength(2);
  });

  it('hands a wake command over and returns to waiting after it is handled', async () => {
    handsFree.enable();
    await handsFree.start();

    adapter.emitFinal('Hey app, add milk to Shopping');

    expect(commands.map((command) => command.transcript)).toEqual(['Hey app, add milk to Shopping']);
    expect(handsFree.getState().status).toBe('handlingCommand');
    expect(adapter.calls.start).toHaveLength(1);

    handsFree.commandHandled();
    await flush();

    expect(handsFree.getState().status).toBe('waitingForWakePhrase');
    expect(adapter.calls.start).toHaveLength(2);
  });

  it('retries system errors with a growing backoff and stops after the limit', async () => {
    handsFree.enable();
    await handsFree.start();
    const delays: number[] = [];

    for (let attempt = 1; attempt <= CONFIG.maxConsecutiveErrors; attempt++) {
      adapter.emitError('network');
      delays.push(handsFree.getState().retryInMs ?? -1);
      await scheduler.runNext();
    }
    adapter.emitError('network');

    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(handsFree.getState()).toMatchObject({ status: 'paused', pauseReason: 'tooManyErrors' });
    expect(scheduler.pending()).toEqual([]);
    expect(adapter.calls.start).toHaveLength(CONFIG.maxConsecutiveErrors + 1);
  });

  it('limits restarts after silence timeouts', async () => {
    handsFree.enable();
    await handsFree.start();

    for (let attempt = 0; attempt < CONFIG.maxIdleRestarts; attempt++) {
      adapter.emitError('noSpeech');
      await scheduler.runNext();
    }
    adapter.emitEnd();

    expect(handsFree.getState()).toMatchObject({ status: 'paused', pauseReason: 'idleLimit' });
    expect(scheduler.pending()).toEqual([]);
  });

  it('stops immediately in the background and does not resume by itself', async () => {
    handsFree.enable();
    await handsFree.start();

    appState.set('background');
    await flush();

    expect(adapter.isListening()).toBe(false);
    expect(handsFree.getState()).toMatchObject({ status: 'paused', pauseReason: 'background' });

    appState.set('active');
    await flush();

    expect(handsFree.getState().status).toBe('paused');
    expect(adapter.calls.start).toHaveLength(1);
  });

  it('cancels a pending retry when the app leaves the foreground', async () => {
    handsFree.enable();
    await handsFree.start();
    adapter.emitError('network');
    expect(scheduler.pending()).toHaveLength(1);

    appState.set('background');
    await flush();

    expect(scheduler.pending()).toEqual([]);
    expect(handsFree.getState().pauseReason).toBe('background');
  });

  it('stops on an audio interruption such as a phone call', async () => {
    handsFree.enable();
    await handsFree.start();

    adapter.emitError('interrupted');

    expect(handsFree.getState()).toMatchObject({ status: 'paused', pauseReason: 'interrupted' });
    expect(scheduler.pending()).toEqual([]);
  });

  it('stops when the permission is lost', async () => {
    handsFree.enable();
    await handsFree.start();
    adapter.setPermission(SPEECH_DENIED);

    adapter.emitError('permissionDenied');

    expect(handsFree.getState()).toMatchObject({ status: 'paused', pauseReason: 'permissionDenied' });

    await handsFree.start();
    expect(handsFree.getState().pauseReason).toBe('permissionDenied');
    expect(adapter.calls.start).toHaveLength(1);
  });

  it('stops with one tap and when it is disabled', async () => {
    handsFree.enable();
    await handsFree.start();

    await handsFree.pause();

    expect(handsFree.getState()).toMatchObject({ status: 'paused', pauseReason: 'user' });
    expect(adapter.isListening()).toBe(false);

    await handsFree.start();
    await handsFree.disable();

    expect(handsFree.getState().status).toBe('off');
    expect(adapter.isListening()).toBe(false);
  });

  it('pauses for manual input and resumes after the manual command', async () => {
    handsFree.enable();
    await handsFree.start();

    await controller.start('manual');
    expect(handsFree.getState()).toMatchObject({ status: 'paused', pauseReason: 'manualInput' });

    adapter.emitFinal('add milk to Shopping');
    handsFree.commandHandled();
    await flush();

    expect(handsFree.getState().status).toBe('waitingForWakePhrase');
  });

  it('calculates a capped exponential backoff', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((attempt) => backoffDelay(attempt, CONFIG))).toEqual([
      1000, 2000, 4000, 8000, 16000, 16000, 16000,
    ]);
  });
});
