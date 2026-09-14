import type { CalendarEventService } from '@/entities/calendar-event';
import type { ListService } from '@/entities/list';
import type { TaskService } from '@/entities/task';
import { VOICE_CONFIG } from '@/shared/config/voice-config';

import {
  createHandsFreeController,
  type HandsFreeController,
  type Scheduler,
} from './hands-free-controller';
import type { SpeechRecognitionAdapter } from './speech-recognition-adapter';
import type { VoiceCommandHint } from './voice-command';
import { createVoiceCommandExecutor, type VoiceCommandExecutor } from './voice-command-executor';
import { stripWakePhrase } from './voice-command-parser';
import { createVoiceCommandSession, type VoiceCommandSession } from './voice-command-session';
import {
  createVoiceInputController,
  type AppStateSource,
  type VoiceInputController,
} from './voice-input-controller';
import {
  createVoiceSettingsStore,
  resolveRecognitionLocale,
  voiceLanguageForLocale,
  type VoiceSettings,
  type VoiceSettingsStore,
} from './voice-settings';

export type VoiceServices = {
  adapter: SpeechRecognitionAdapter;
  controller: VoiceInputController;
  handsFree: HandsFreeController;
  session: VoiceCommandSession;
  executor: VoiceCommandExecutor;
  settings: VoiceSettingsStore;
  appState: AppStateSource;
  openSettings: () => Promise<void>;
  startManual(hint: VoiceCommandHint): Promise<void>;
  setFocusedHint(hint: VoiceCommandHint): void;
  getLocale(): string;
  setHandsFreeEnabled(enabled: boolean): Promise<boolean>;
  dispose(): void;
};

export type VoiceServicesDeps = {
  adapter: SpeechRecognitionAdapter;
  appState: AppStateSource;
  scheduler: Scheduler;
  tasks: TaskService;
  events: CalendarEventService;
  lists: ListService;
  settingsRepository: {
    load(): Promise<VoiceSettings>;
    save(settings: VoiceSettings): Promise<void>;
  };
  now: () => Date;
  timeZone: () => string;
  deviceLocale: () => string;
  openSettings: () => Promise<void>;
};

export function createVoiceServices(deps: VoiceServicesDeps): VoiceServices {
  const settings = createVoiceSettingsStore(deps.settingsRepository);
  const getLocale = () => resolveRecognitionLocale(settings.get().language, deps.deviceLocale());
  const controller = createVoiceInputController({
    adapter: deps.adapter,
    appState: deps.appState,
    getLocale,
    contextualStrings: () => VOICE_CONFIG.wakePhrases.map((wake) => wake.phrase),
  });
  const executor = createVoiceCommandExecutor({
    tasks: deps.tasks,
    events: deps.events,
    lists: deps.lists,
  });
  const session = createVoiceCommandSession({
    executor,
    loadLists: async () =>
      (await deps.lists.getLists()).map((list) => ({
        id: list.id,
        title: list.title,
        kind: list.kind,
      })),
    now: deps.now,
    timeZone: deps.timeZone,
    preferredLanguage: () => voiceLanguageForLocale(getLocale()),
  });
  let manualHint: VoiceCommandHint = { kind: 'none' };
  let focusedHint: VoiceCommandHint = { kind: 'none' };
  let waitingForPreview: (() => void) | null = null;

  function afterCommand(outcome: 'ignored' | 'executed' | 'preview' | 'duplicate') {
    if (outcome !== 'preview') {
      handsFree.commandHandled();
      return;
    }
    waitingForPreview?.();
    waitingForPreview = session.subscribe((state) => {
      if (state.pending === null) {
        waitingForPreview?.();
        waitingForPreview = null;
        handsFree.commandHandled();
      }
    });
  }

  const handsFree = createHandsFreeController({
    controller,
    appState: deps.appState,
    scheduler: deps.scheduler,
    config: VOICE_CONFIG.handsFree,
    hasWakePhrase: (transcript) =>
      stripWakePhrase(transcript, VOICE_CONFIG.wakePhrases).hadWakePhrase,
    onCommand: (result) => {
      void session
        .handleTranscript({ ...result, hint: focusedHint })
        .then(afterCommand, () => handsFree.commandHandled());
    },
  });

  const subscriptions = [
    controller.onResult((result) => {
      if (result.mode !== 'manual') {
        return;
      }
      void session
        .handleTranscript({ ...result, hint: manualHint })
        .then(afterCommand, () => handsFree.commandHandled());
    }),
    controller.onSessionEnd((end) => {
      if (end.mode === 'manual' && end.reason !== 'result') {
        handsFree.commandHandled();
      }
    }),
    settings.subscribe((next) => {
      if (next.handsFreeEnabled) {
        handsFree.enable();
      } else if (handsFree.getState().status !== 'off') {
        void handsFree.disable();
      }
    }),
  ];

  return {
    adapter: deps.adapter,
    controller,
    handsFree,
    session,
    executor,
    settings,
    appState: deps.appState,
    openSettings: deps.openSettings,

    async startManual(hint) {
      manualHint = hint;
      const state = controller.getState();
      if (state.mode === 'manual' && state.status === 'listening') {
        await controller.stop();
        return;
      }
      await controller.start('manual');
    },

    setFocusedHint(hint) {
      focusedHint = hint;
    },

    getLocale,

    async setHandsFreeEnabled(enabled) {
      if (!enabled) {
        await settings.update({ handsFreeEnabled: false });
        return true;
      }
      if (!(await deps.adapter.isAvailable())) {
        return false;
      }
      let permission = await deps.adapter.getPermissionStatus();
      if (permission.status !== 'granted' && permission.canAskAgain) {
        permission = await deps.adapter.requestPermissions();
      }
      if (permission.status !== 'granted') {
        return false;
      }
      await settings.update({ handsFreeEnabled: true });
      return true;
    },

    dispose() {
      waitingForPreview?.();
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
      handsFree.dispose();
      controller.dispose();
    },
  };
}
