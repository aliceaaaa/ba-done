export const VOICE_ENTRY_PAYLOAD_VERSION = 1;

export const VOICE_ENTRY_SOURCES = ['iosAppIntent', 'androidAppAction', 'deepLink', 'shortcut'] as const;
export type VoiceEntrySource = (typeof VOICE_ENTRY_SOURCES)[number];

export const VOICE_ENTRY_ACTIONS = [
  'addListItem',
  'captureFutureTask',
  'createRankedTask',
  'createCalendarEvent',
  'openToday',
  'openVoiceCapture',
] as const;
export type VoiceEntryAction = (typeof VOICE_ENTRY_ACTIONS)[number];

export const VOICE_ENTRY_PAYLOAD_KEYS = [
  'version',
  'intentId',
  'action',
  'text',
  'listName',
  'date',
  'time',
  'durationMinutes',
  'priority',
  'locale',
  'createdAt',
] as const;
export type VoiceEntryPayloadKey = (typeof VOICE_ENTRY_PAYLOAD_KEYS)[number];

export const VOICE_ENTRY_LIMITS = {
  maxTextLength: 280,
  maxListNameLength: 80,
  maxLocaleLength: 35,
  minDurationMinutes: 1,
  maxDurationMinutes: 1440,
  maxAgeMs: 10 * 60_000,
  maxClockSkewMs: 2 * 60_000,
} as const;

export const TRUSTED_VOICE_ENTRY_SOURCES: readonly VoiceEntrySource[] = [
  'iosAppIntent',
  'androidAppAction',
];

export type VoiceEntryIntent = {
  id: string;
  source: VoiceEntrySource;
  action: VoiceEntryAction;
  text: string | null;
  listName: string | null;
  date: string | null;
  time: string | null;
  durationMinutes: number | null;
  priority: number | null;
  locale: string | null;
  createdAt: string | null;
  receivedAt: string;
};

export function isTrustedVoiceEntry(intent: Pick<VoiceEntryIntent, 'source'>): boolean {
  return TRUSTED_VOICE_ENTRY_SOURCES.includes(intent.source);
}

export function isNavigationAction(action: VoiceEntryAction): boolean {
  return action === 'openToday' || action === 'openVoiceCapture';
}
