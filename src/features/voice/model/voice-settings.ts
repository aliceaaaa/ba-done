import type { VoiceLanguage } from './voice-command';

export const RECOGNITION_LANGUAGES = [
  { value: 'system', label: 'Device language' },
  { value: 'en-US', label: 'English' },
  { value: 'ru-RU', label: 'Russian' },
] as const;

export type RecognitionLanguage = (typeof RECOGNITION_LANGUAGES)[number]['value'];

export type VoiceSettings = {
  handsFreeEnabled: boolean;
  language: RecognitionLanguage;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  handsFreeEnabled: false,
  language: 'system',
};

export type VoiceSettingsStore = {
  get(): VoiceSettings;
  isLoaded(): boolean;
  load(): Promise<VoiceSettings>;
  update(patch: Partial<VoiceSettings>): Promise<VoiceSettings>;
  subscribe(listener: (settings: VoiceSettings) => void): () => void;
};

export function createVoiceSettingsStore(repository: {
  load(): Promise<VoiceSettings>;
  save(settings: VoiceSettings): Promise<void>;
}): VoiceSettingsStore {
  let settings = DEFAULT_VOICE_SETTINGS;
  let loaded = false;
  const listeners = new Set<(settings: VoiceSettings) => void>();

  function publish(next: VoiceSettings) {
    settings = next;
    for (const listener of [...listeners]) {
      listener(settings);
    }
  }

  return {
    get() {
      return settings;
    },

    isLoaded() {
      return loaded;
    },

    async load() {
      try {
        const stored = await repository.load();
        loaded = true;
        publish(stored);
      } catch {
        loaded = true;
        publish(DEFAULT_VOICE_SETTINGS);
      }
      return settings;
    },

    async update(patch) {
      const next = { ...settings, ...patch };
      await repository.save(next);
      publish(next);
      return next;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function resolveRecognitionLocale(
  language: RecognitionLanguage,
  deviceLocale: string,
): string {
  return language === 'system' ? deviceLocale : language;
}

export function voiceLanguageForLocale(locale: string): VoiceLanguage {
  return locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
