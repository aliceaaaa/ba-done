import {
  computeMissingFields,
  matchListTarget,
  parseVoiceCommand,
  type VoiceAmbiguity,
  type VoiceCommandDraft,
  type VoiceCommandHint,
  type VoiceLanguage,
  type VoiceListOption,
} from '@/features/voice';
import { VOICE_CONFIG } from '@/shared/config/voice-config';
import { addMinutesToLocalDateTime, toLocalDate } from '@/shared/lib/local-date';

import type { VoiceEntryIntent } from './voice-entry-intent';

export type VoiceEntryDraftContext = {
  now: Date;
  timeZone: string;
  lists: readonly VoiceListOption[];
  preferredLanguage: VoiceLanguage;
};

const PENDING_LIST_ID = '__voice-entry-list__';

function hintFor(intent: VoiceEntryIntent): VoiceCommandHint {
  switch (intent.action) {
    case 'addListItem':
      return { kind: 'listItem', listId: PENDING_LIST_ID };
    case 'captureFutureTask':
      return { kind: 'futureTask' };
    default:
      return { kind: 'none' };
  }
}

function languageOf(intent: VoiceEntryIntent, fallback: VoiceLanguage): VoiceLanguage {
  if (intent.locale === null) {
    return fallback;
  }
  return intent.locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function emptyDraft(language: VoiceLanguage): VoiceCommandDraft {
  return {
    kind: 'unknown',
    transcript: '',
    language,
    title: null,
    targetListId: null,
    targetListName: null,
    date: null,
    priority: null,
    exactTime: null,
    dayPeriod: null,
    eventStart: null,
    eventEnd: null,
    reminder: null,
    quantity: null,
    unit: null,
    missingFields: [],
    ambiguities: [],
    confidence: 0,
  };
}

function parsedDraft(intent: VoiceEntryIntent, context: VoiceEntryDraftContext): VoiceCommandDraft {
  const language = languageOf(intent, context.preferredLanguage);
  if (intent.text === null) {
    return emptyDraft(language);
  }
  const outcome = parseVoiceCommand(intent.text, {
    now: context.now,
    timeZone: context.timeZone,
    mode: 'manual',
    wakePhrases: VOICE_CONFIG.wakePhrases,
    hint: hintFor(intent),
    lists: context.lists,
    preferredLanguage: language,
  });
  return outcome.status === 'parsed' ? outcome.draft : emptyDraft(language);
}

function withoutAmbiguities(
  ambiguities: readonly VoiceAmbiguity[],
  types: readonly VoiceAmbiguity['type'][],
): VoiceAmbiguity[] {
  return ambiguities.filter((ambiguity) => !types.includes(ambiguity.type));
}

function resolveList(
  intent: VoiceEntryIntent,
  draft: VoiceCommandDraft,
  lists: readonly VoiceListOption[],
): Pick<VoiceCommandDraft, 'targetListId' | 'targetListName' | 'ambiguities'> {
  const ambiguities = withoutAmbiguities(draft.ambiguities, ['taskOrEvent', 'eventEndSuggested']);
  const spokenTarget = draft.targetListId !== PENDING_LIST_ID && draft.kind === 'listItem';
  if (spokenTarget && intent.listName === null) {
    return { targetListId: draft.targetListId, targetListName: draft.targetListName, ambiguities };
  }
  const cleared = withoutAmbiguities(ambiguities, ['listNotFound', 'multipleLists']);
  if (intent.listName !== null) {
    const match = matchListTarget({ kind: 'name', name: intent.listName }, lists);
    return match.status === 'found'
      ? { targetListId: match.listId, targetListName: match.listName, ambiguities: cleared }
      : {
          targetListId: null,
          targetListName: match.listName,
          ambiguities: [...cleared, match.ambiguity],
        };
  }
  const shopping = lists.filter((list) => list.kind === 'shopping');
  const [only] = shopping;
  return only !== undefined && shopping.length === 1
    ? { targetListId: only.id, targetListName: only.title, ambiguities: cleared }
    : { targetListId: null, targetListName: null, ambiguities: cleared };
}

function finalize(draft: Omit<VoiceCommandDraft, 'missingFields'>): VoiceCommandDraft {
  return { ...draft, missingFields: computeMissingFields(draft) };
}

export function buildDraftFromVoiceEntry(
  intent: VoiceEntryIntent,
  context: VoiceEntryDraftContext,
): VoiceCommandDraft | null {
  if (intent.action === 'openToday' || intent.action === 'openVoiceCapture') {
    return null;
  }
  const parsed = parsedDraft(intent, context);
  const base = {
    ...parsed,
    targetListId: null,
    targetListName: null,
    quantity: null,
    unit: null,
    eventStart: null,
    eventEnd: null,
  };

  switch (intent.action) {
    case 'addListItem':
      return finalize({
        ...base,
        kind: 'listItem',
        date: null,
        priority: null,
        exactTime: null,
        dayPeriod: null,
        reminder: null,
        quantity: parsed.quantity,
        unit: parsed.unit,
        ...resolveList(intent, parsed, context.lists),
      });

    case 'captureFutureTask':
    case 'createRankedTask': {
      const date = intent.date ?? parsed.date;
      const priority = intent.priority ?? parsed.priority;
      const ranked = intent.action === 'createRankedTask' || date !== null || priority !== null;
      return finalize({
        ...base,
        kind: ranked ? 'rankedTask' : 'futureTask',
        date: ranked ? date : null,
        priority: ranked ? priority : null,
        exactTime: intent.time ?? parsed.exactTime,
        dayPeriod: intent.time === null ? parsed.dayPeriod : null,
        reminder: ranked || parsed.reminder?.type !== 'exact' ? parsed.reminder : null,
        ambiguities: withoutAmbiguities(parsed.ambiguities, [
          'taskOrEvent',
          'eventEndSuggested',
          'listNotFound',
          'multipleLists',
        ]),
      });
    }

    case 'createCalendarEvent': {
      const date = intent.date ?? parsed.date;
      const startTime = intent.time ?? parsed.eventStart?.slice(11) ?? parsed.exactTime ?? null;
      const eventStart = date === null || startTime === null ? null : `${date}T${startTime}`;
      const ambiguities = withoutAmbiguities(parsed.ambiguities, [
        'taskOrEvent',
        'eventEndSuggested',
        'listNotFound',
        'multipleLists',
      ]);
      let eventEnd: string | null = null;
      if (eventStart !== null) {
        if (intent.durationMinutes !== null) {
          eventEnd = addMinutesToLocalDateTime(eventStart, intent.durationMinutes);
        } else if (parsed.eventEnd !== null && intent.time === null && intent.date === null) {
          eventEnd = parsed.eventEnd;
        } else {
          const suggestedEnd = addMinutesToLocalDateTime(
            eventStart,
            VOICE_CONFIG.suggestedEventMinutes,
          );
          eventEnd = suggestedEnd;
          ambiguities.push({ type: 'eventEndSuggested', suggestedEnd });
        }
      }
      return finalize({
        ...base,
        kind: 'calendarEvent',
        date,
        priority: null,
        exactTime: null,
        dayPeriod: null,
        reminder: parsed.reminder?.type === 'exact' ? parsed.reminder : null,
        eventStart,
        eventEnd,
        ambiguities,
      });
    }
  }
}

export function todayFor(context: Pick<VoiceEntryDraftContext, 'now' | 'timeZone'>): string {
  return toLocalDate(context.now, context.timeZone);
}
