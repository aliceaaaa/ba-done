import type { DayPeriod } from '@/entities/task';

export const VOICE_COMMAND_KINDS = [
  'listItem',
  'futureTask',
  'rankedTask',
  'calendarEvent',
  'unknown',
] as const;
export type VoiceCommandKind = (typeof VOICE_COMMAND_KINDS)[number];

export type VoiceLanguage = 'en' | 'ru';

export type VoiceField =
  | 'kind'
  | 'title'
  | 'targetList'
  | 'date'
  | 'priority'
  | 'eventStart'
  | 'eventEnd'
  | 'reminder';

export type VoiceReminderDraft =
  | { type: 'exact'; localDateTime: string }
  | { type: 'dayPeriod'; period: DayPeriod };

export type VoiceAmbiguity =
  | { type: 'taskOrEvent' }
  | { type: 'listNotFound'; listName: string }
  | { type: 'multipleLists'; listName: string; candidateIds: string[] }
  | { type: 'eventEndSuggested'; suggestedEnd: string }
  | { type: 'unrecognizedDate'; text: string }
  | { type: 'unrecognizedTime'; text: string };

export type VoiceCommandDraft = {
  kind: VoiceCommandKind;
  transcript: string;
  language: VoiceLanguage;
  title: string | null;
  targetListId: string | null;
  targetListName: string | null;
  date: string | null;
  priority: number | null;
  exactTime: string | null;
  dayPeriod: DayPeriod | null;
  eventStart: string | null;
  eventEnd: string | null;
  reminder: VoiceReminderDraft | null;
  quantity: number | null;
  unit: string | null;
  missingFields: VoiceField[];
  ambiguities: VoiceAmbiguity[];
  confidence: number;
};

export type VoiceCommandHint =
  | { kind: 'listItem'; listId: string }
  | { kind: 'futureTask' }
  | { kind: 'rankedTask'; date: string }
  | { kind: 'calendar'; date: string }
  | { kind: 'none' };

export type VoiceListOption = {
  id: string;
  title: string;
  kind: 'shopping' | 'custom';
};

export type VoiceInputMode = 'manual' | 'handsFree';

export type VoiceParseContext = {
  now: Date;
  timeZone: string;
  mode: VoiceInputMode;
  wakePhrases: readonly { phrase: string }[];
  hint: VoiceCommandHint;
  lists: readonly VoiceListOption[];
  preferredLanguage?: VoiceLanguage;
  speechConfidence?: number;
};

export type VoiceParseOutcome =
  | { status: 'ignored'; reason: 'missingWakePhrase' | 'empty' }
  | { status: 'parsed'; draft: VoiceCommandDraft; hadWakePhrase: boolean };
