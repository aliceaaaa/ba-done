import type { SqlExecutor } from '@/database/sql-database';

import {
  DEFAULT_VOICE_SETTINGS,
  RECOGNITION_LANGUAGES,
  type RecognitionLanguage,
  type VoiceSettings,
} from '../model/voice-settings';

const HANDS_FREE_KEY = 'voice.handsFreeEnabled';
const LANGUAGE_KEY = 'voice.recognitionLanguage';

export type VoiceSettingsRepository = {
  load(): Promise<VoiceSettings>;
  save(settings: VoiceSettings): Promise<void>;
};

function isLanguage(value: string): value is RecognitionLanguage {
  return RECOGNITION_LANGUAGES.some((language) => language.value === value);
}

export function createVoiceSettingsRepository(db: SqlExecutor): VoiceSettingsRepository {
  async function read(key: string): Promise<string | null> {
    const row = await db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
    return row?.value ?? null;
  }

  async function write(key: string, value: string): Promise<void> {
    await db.run(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  return {
    async load() {
      const [handsFree, language] = await Promise.all([read(HANDS_FREE_KEY), read(LANGUAGE_KEY)]);
      return {
        handsFreeEnabled: handsFree === 'true',
        language: language !== null && isLanguage(language) ? language : DEFAULT_VOICE_SETTINGS.language,
      };
    },

    async save(settings) {
      await write(HANDS_FREE_KEY, settings.handsFreeEnabled ? 'true' : 'false');
      await write(LANGUAGE_KEY, settings.language);
    },
  };
}
