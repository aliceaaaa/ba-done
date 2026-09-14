import { isValidLocalDate, isValidLocalTime } from '@/shared/lib/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import {
  TRUSTED_VOICE_ENTRY_SOURCES,
  VOICE_ENTRY_ACTIONS,
  VOICE_ENTRY_LIMITS,
  VOICE_ENTRY_PAYLOAD_VERSION,
  type VoiceEntryAction,
  type VoiceEntryIntent,
  type VoiceEntrySource,
} from './voice-entry-intent';

export type VoiceEntryRejectionReason =
  | 'notAnObject'
  | 'unsupportedVersion'
  | 'unknownAction'
  | 'invalidIntentId'
  | 'missingIntentId'
  | 'invalidText'
  | 'invalidListName'
  | 'invalidDate'
  | 'invalidTime'
  | 'invalidDuration'
  | 'invalidPriority'
  | 'invalidLocale'
  | 'invalidCreatedAt'
  | 'expired';

export type VoiceEntryRejection = {
  reason: VoiceEntryRejectionReason;
};

export type VoiceEntryParseContext = {
  source: VoiceEntrySource;
  now: Date;
  generateId: () => string;
};

const INTENT_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;
const INTEGER_PATTERN = /^\d{1,5}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

type Field<T> = Result<T | null, VoiceEntryRejection>;

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });
}

function reject(reason: VoiceEntryRejectionReason): VoiceEntryRejection {
  return { reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === 'string' ? value : undefined;
}

function readInteger(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : undefined;
  }
  if (typeof value === 'string' && INTEGER_PATTERN.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

function textField(
  value: unknown,
  maxLength: number,
  reason: VoiceEntryRejectionReason,
): Field<string> {
  const raw = readString(value);
  if (raw === undefined || (raw !== null && hasControlCharacters(raw))) {
    return err(reject(reason));
  }
  if (raw === null) {
    return ok(null);
  }
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if ([...trimmed].length > maxLength) {
    return err(reject(reason));
  }
  return ok(trimmed.length === 0 ? null : trimmed);
}

function patternField(
  value: unknown,
  valid: (text: string) => boolean,
  reason: VoiceEntryRejectionReason,
): Field<string> {
  const raw = readString(value);
  if (raw === undefined) {
    return err(reject(reason));
  }
  if (raw === null || raw.trim().length === 0) {
    return ok(null);
  }
  return valid(raw.trim()) ? ok(raw.trim()) : err(reject(reason));
}

function integerField(
  value: unknown,
  min: number,
  max: number,
  reason: VoiceEntryRejectionReason,
): Field<number> {
  const parsed = readInteger(value);
  if (parsed === undefined || (parsed !== null && (parsed < min || parsed > max))) {
    return err(reject(reason));
  }
  return ok(parsed);
}

function isAction(value: unknown): value is VoiceEntryAction {
  return typeof value === 'string' && (VOICE_ENTRY_ACTIONS as readonly string[]).includes(value);
}

export function parseVoiceEntryPayload(
  raw: unknown,
  { source, now, generateId }: VoiceEntryParseContext,
): Result<VoiceEntryIntent, VoiceEntryRejection> {
  if (!isRecord(raw)) {
    return err(reject('notAnObject'));
  }
  if (readInteger(raw.version) !== VOICE_ENTRY_PAYLOAD_VERSION) {
    return err(reject('unsupportedVersion'));
  }
  if (!isAction(raw.action)) {
    return err(reject('unknownAction'));
  }
  const trusted = TRUSTED_VOICE_ENTRY_SOURCES.includes(source);

  const intentId = patternField(raw.intentId, (id) => INTENT_ID_PATTERN.test(id), 'invalidIntentId');
  const createdAt = patternField(
    raw.createdAt,
    (instant) => ISO_INSTANT_PATTERN.test(instant) && !Number.isNaN(Date.parse(instant)),
    'invalidCreatedAt',
  );
  const fields = [
    intentId,
    createdAt,
    textField(raw.text, VOICE_ENTRY_LIMITS.maxTextLength, 'invalidText'),
    textField(raw.listName, VOICE_ENTRY_LIMITS.maxListNameLength, 'invalidListName'),
    patternField(raw.date, isValidLocalDate, 'invalidDate'),
    patternField(raw.time, isValidLocalTime, 'invalidTime'),
    integerField(
      raw.durationMinutes,
      VOICE_ENTRY_LIMITS.minDurationMinutes,
      VOICE_ENTRY_LIMITS.maxDurationMinutes,
      'invalidDuration',
    ),
    integerField(raw.priority, 1, 10, 'invalidPriority'),
    patternField(
      raw.locale,
      (locale) => locale.length <= VOICE_ENTRY_LIMITS.maxLocaleLength && LOCALE_PATTERN.test(locale),
      'invalidLocale',
    ),
  ] as const;
  for (const field of fields) {
    if (!field.ok) {
      return field;
    }
  }
  const [id, created, text, listName, date, time, duration, priority, locale] = fields.map(
    (field) => (field.ok ? field.value : null),
  );

  if (trusted && (id === null || created === null)) {
    return err(reject(id === null ? 'missingIntentId' : 'invalidCreatedAt'));
  }
  if (typeof created === 'string') {
    const age = now.getTime() - Date.parse(created);
    if (age > VOICE_ENTRY_LIMITS.maxAgeMs || age < -VOICE_ENTRY_LIMITS.maxClockSkewMs) {
      return err(reject('expired'));
    }
  }

  return ok({
    id: typeof id === 'string' ? id : generateId(),
    source,
    action: raw.action,
    text: typeof text === 'string' ? text : null,
    listName: typeof listName === 'string' ? listName : null,
    date: typeof date === 'string' ? date : null,
    time: typeof time === 'string' ? time : null,
    durationMinutes: typeof duration === 'number' ? duration : null,
    priority: typeof priority === 'number' ? priority : null,
    locale: typeof locale === 'string' ? locale : null,
    createdAt: typeof created === 'string' ? created : null,
    receivedAt: now.toISOString(),
  });
}

export const VOICE_ENTRY_URL_PARAMS = {
  v: 'version',
  id: 'intentId',
  action: 'action',
  text: 'text',
  list: 'listName',
  date: 'date',
  time: 'time',
  duration: 'durationMinutes',
  priority: 'priority',
  locale: 'locale',
  createdAt: 'createdAt',
} as const;

export type VoiceEntryUrlParams = Record<string, string | string[] | undefined>;

export function payloadFromUrlParams(params: VoiceEntryUrlParams): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [param, key] of Object.entries(VOICE_ENTRY_URL_PARAMS)) {
    const value = params[param];
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') {
      payload[key] = first;
    }
  }
  return payload;
}

export function sourceFromUrlParams(params: VoiceEntryUrlParams): VoiceEntrySource {
  const entry = Array.isArray(params.entry) ? params.entry[0] : params.entry;
  return entry === 'shortcut' ? 'shortcut' : 'deepLink';
}
