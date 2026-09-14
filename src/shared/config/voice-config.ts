export type WakePhrase = {
  language: 'en' | 'ru';
  phrase: string;
};

export const VOICE_CONFIG = {
  wakePhraseLabel: 'Hey app',
  wakePhrases: [
    { language: 'en', phrase: 'Hey app' },
    { language: 'ru', phrase: 'Эй приложение' },
  ] satisfies WakePhrase[],
  handsFree: {
    maxConsecutiveErrors: 5,
    initialBackoffMs: 1000,
    maxBackoffMs: 16000,
    maxIdleRestarts: 20,
    restartDelayMs: 400,
  },
  suggestedEventMinutes: 60,
} as const;

export const HANDS_FREE_TOGGLE_LABEL = `Listen for “${VOICE_CONFIG.wakePhraseLabel}” while the app is open`;
