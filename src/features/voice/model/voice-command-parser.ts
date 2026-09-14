import type { DayPeriod } from '@/entities/task';
import { addMinutesToLocalDateTime, toLocalDate } from '@/shared/lib/local-date';
import { VOICE_CONFIG } from '@/shared/config/voice-config';

import {
  extractDate,
  extractDayPeriod,
  extractDuration,
  extractTime,
  extractTimeRange,
} from '../lib/voice-date-time';
import {
  NUMBER_PATTERN,
  WORD_END,
  WORD_START,
  capitalize,
  cleanTitle,
  collapseSpaces,
  escapeRegExp,
  trimEdgePunctuation,
  extract,
  foldText,
  hasCyrillic,
  parseNumber,
  pattern,
} from '../lib/voice-text';
import { matchListTarget, type ListTarget } from './list-target-matcher';
import type {
  VoiceAmbiguity,
  VoiceCommandDraft,
  VoiceCommandKind,
  VoiceField,
  VoiceLanguage,
  VoiceParseContext,
  VoiceParseOutcome,
  VoiceReminderDraft,
} from './voice-command';

type Signals = {
  text: string;
  priority: number | null;
  durationMinutes: number | null;
  range: { start: string; end: string } | null;
  time: string | null;
  date: string | null;
  dayPeriod: DayPeriod | null;
  reminderRequested: boolean;
  futureKeyword: boolean;
  taskKeyword: boolean;
  eventKeyword: boolean;
  commandVerb: boolean;
  listTarget: ListTarget | null;
  quantity: number | null;
  unit: string | null;
  ambiguities: VoiceAmbiguity[];
};

const WAKE_SEPARATOR = '[\\s,.!?:;—–-]*';

function wakePhrasePattern(phrase: string): RegExp {
  const words = foldText(phrase)
    .split(/[\s,.!?]+/)
    .filter((word) => word.length > 0)
    .map(escapeRegExp);
  return pattern(`^${WAKE_SEPARATOR}${words.join(WAKE_SEPARATOR)}(?![\\p{L}\\p{N}])${WAKE_SEPARATOR}`);
}

export function stripWakePhrase(
  transcript: string,
  wakePhrases: readonly { phrase: string }[],
): { text: string; hadWakePhrase: boolean } {
  const folded = foldText(transcript);
  for (const { phrase } of wakePhrases) {
    const match = wakePhrasePattern(phrase).exec(folded);
    if (match !== null) {
      return { text: transcript.slice(match[0].length), hadWakePhrase: true };
    }
  }
  return { text: transcript, hadWakePhrase: false };
}

function takeFlag(signals: Signals, regex: RegExp): boolean {
  const found = extract(signals.text, regex, () => true);
  if (found === null) {
    return false;
  }
  signals.text = found.text;
  return true;
}

function extractPriority(signals: Signals) {
  const readers = [
    pattern(
      `${WORD_START}(?:(?:with|and)\\s+)?(?:a\\s+)?priority(?:\\s+(?:of|is|number))?[\\s:]*(${NUMBER_PATTERN})${WORD_END}`,
    ),
    pattern(`${WORD_START}(?:(?:с|и)\\s+)?приоритет(?:ом)?(?:\\s+номер)?[\\s:]*(${NUMBER_PATTERN})${WORD_END}`),
  ];
  for (const regex of readers) {
    const found = extract(signals.text, regex, (match) => parseNumber(match[1] ?? ''));
    if (found !== null) {
      signals.priority = found.value;
      signals.text = found.text;
      return;
    }
  }
}

function extractSchedule(signals: Signals, today: string) {
  const duration = extractDuration(signals.text);
  if (duration !== null) {
    signals.durationMinutes = duration.value;
    signals.text = duration.text;
  }
  const date = extractDate(signals.text, today);
  if (date !== null) {
    signals.text = date.text;
    if ('invalid' in date.value) {
      signals.ambiguities.push({ type: 'unrecognizedDate', text: date.value.invalid });
    } else {
      signals.date = date.value.date;
      signals.dayPeriod = date.value.period ?? null;
    }
  }
  const range = extractTimeRange(signals.text);
  if (range !== null) {
    signals.text = range.text;
    if ('invalid' in range.value) {
      signals.ambiguities.push({ type: 'unrecognizedTime', text: range.value.invalid });
    } else {
      signals.range = range.value;
    }
  }
  if (signals.range === null) {
    const time = extractTime(signals.text);
    if (time !== null) {
      signals.text = time.text;
      if ('invalid' in time.value) {
        signals.ambiguities.push({ type: 'unrecognizedTime', text: time.value.invalid });
      } else {
        signals.time = time.value.time;
      }
    }
  }
  const period = extractDayPeriod(signals.text);
  if (period !== null) {
    signals.text = period.text;
    signals.dayPeriod = period.value;
  }
}

const COMMAND_VERBS = pattern(
  `^\\s*(?:please\\s+|пожалуйста\\s+)?(?:add|create|schedule|put|make|new|добавь(?:те)?|добавить|создай(?:те)?|создать|запиши(?:те)?|записать|запланируй(?:те)?|поставь(?:те)?)${WORD_END}`,
);

const EN_UNITS =
  'bottles?|packs?|packets?|cans?|boxes|box|bags?|cartons?|jars?|kg|kilos?|kilograms?|grams?|g|liters?|litres?|l|pieces?|pcs|loaf|loaves|dozen|lbs?|pounds?|ounces?|oz|bunch(?:es)?';
const RU_UNITS =
  'бутыл(?:ка|ки|ок|ку)|пач(?:ка|ки|ек|ку)|бан(?:ка|ки|ок|ку)|короб(?:ка|ки|ок|ку)|пакет(?:а|ов)?|кг|килограмм(?:а|ов)?|кило|грамм(?:а|ов)?|г|литр(?:а|ов)?|л|штук(?:а|и|у)?|шт|упаков(?:ка|ки|ок|ку)|десят(?:ок|ка)|буханк(?:а|и|у)|батон(?:а|ов)?|пучо?к(?:а|ов)?';
const UNITS = `${EN_UNITS}|${RU_UNITS}`;

function extractQuantity(title: string): { title: string; quantity: number | null; unit: string | null } {
  const leading = pattern(`^(${NUMBER_PATTERN}|an?)\\s+(${UNITS})(?:\\s+of)?\\s+(.+)$`).exec(title);
  if (leading !== null) {
    const raw = foldText(leading[1] ?? '');
    const quantity = raw === 'a' || raw === 'an' ? 1 : parseNumber(raw);
    if (quantity !== null) {
      return { title: leading[3] ?? '', quantity, unit: leading[2] ?? null };
    }
  }
  const trailing = pattern(`^(.+?)[\\s,]+(${NUMBER_PATTERN})\\s+(${UNITS})$`).exec(title);
  if (trailing !== null) {
    const quantity = parseNumber(trailing[2] ?? '');
    if (quantity !== null) {
      return { title: trailing[1] ?? '', quantity, unit: trailing[3] ?? null };
    }
  }
  const counted = pattern(`^(${NUMBER_PATTERN})\\s+(.+)$`).exec(title);
  if (counted !== null) {
    const quantity = parseNumber(counted[1] ?? '');
    if (quantity !== null && quantity > 0) {
      return { title: counted[2] ?? '', quantity, unit: null };
    }
  }
  return { title, quantity: null, unit: null };
}

function extractExplicitList(signals: Signals) {
  const prefixed =
    pattern(`^\\s*(?:во?|на)\\s+(?:мой\\s+)?список\\s+(.+?)\\s*[—–:-]\\s*(.+)$`).exec(signals.text) ??
    pattern(`^\\s*(?:on|in|to)\\s+(?:my\\s+|the\\s+)?(.+?)\\s+list\\s*[—–:-]\\s*(.+)$`).exec(signals.text);
  if (prefixed !== null) {
    signals.listTarget = { kind: 'name', name: prefixed[1] ?? '' };
    signals.text = prefixed[2] ?? '';
    return;
  }
  const readers: [RegExp, (match: RegExpExecArray) => ListTarget | null][] = [
    [
      pattern(`${WORD_START}(?:во?|на)\\s+(?:мой\\s+)?список\\s+покупок${WORD_END}`),
      () => ({ kind: 'alias', alias: 'shopping' }),
    ],
    [
      pattern(`${WORD_START}(?:to|onto|on|in)\\s+(?:my\\s+|the\\s+)?shopping\\s+list${WORD_END}`),
      () => ({ kind: 'alias', alias: 'shopping' }),
    ],
    [
      pattern(`${WORD_START}(?:во?|на)\\s+(?:мой\\s+)?список\\s+(.+)$`),
      (match) => ({ kind: 'name', name: match[1] ?? '' }),
    ],
    [
      pattern(`${WORD_START}(?:to|onto|on|in)\\s+(?:my\\s+|the\\s+)?(.+?)\\s+list\\s*[.!]?$`),
      (match) => ({ kind: 'name', name: match[1] ?? '' }),
    ],
  ];
  for (const [regex, read] of readers) {
    const found = extract(signals.text, regex, read);
    if (found !== null) {
      signals.listTarget = found.value;
      signals.text = found.text;
      return;
    }
  }
}

function extractTailList(signals: Signals) {
  const found =
    extract(signals.text, pattern(`${WORD_START}(?:to|onto)\\s+(?:my\\s+|the\\s+)?([^\\s].*?)\\s*[.!]?$`), (match) =>
      cleanTitle(match[1] ?? ''),
    ) ??
    extract(signals.text, pattern(`${WORD_START}(?:во?)\\s+([^\\s].*?)\\s*[.!]?$`), (match) =>
      cleanTitle(match[1] ?? ''),
    );
  if (found !== null && found.value.length > 0 && found.value.split(' ').length <= 3) {
    signals.listTarget = { kind: 'name', name: found.value };
    signals.text = found.text;
  }
}

function hasSchedule(signals: Signals): boolean {
  return (
    signals.date !== null ||
    signals.time !== null ||
    signals.range !== null ||
    signals.durationMinutes !== null ||
    signals.dayPeriod !== null
  );
}

function detectLanguage(transcript: string, preferred: VoiceLanguage | undefined): VoiceLanguage {
  if (hasCyrillic(transcript)) {
    return 'ru';
  }
  return /[a-z]/i.test(transcript) ? 'en' : (preferred ?? 'en');
}

function decideKind(signals: Signals, context: VoiceParseContext): VoiceCommandKind {
  const { hint } = context;
  if (signals.listTarget !== null) {
    return 'listItem';
  }
  if (signals.eventKeyword || signals.range !== null || signals.durationMinutes !== null) {
    return 'calendarEvent';
  }
  const taskLike =
    signals.reminderRequested ||
    signals.taskKeyword ||
    signals.futureKeyword ||
    signals.priority !== null;
  if (taskLike) {
    if (signals.futureKeyword && signals.date === null) {
      return 'futureTask';
    }
    if (signals.date !== null || signals.priority !== null) {
      return 'rankedTask';
    }
    if (signals.reminderRequested && signals.time !== null) {
      return 'rankedTask';
    }
    return hint.kind === 'rankedTask' ? 'rankedTask' : 'futureTask';
  }
  if (hint.kind === 'listItem' && !hasSchedule(signals)) {
    return 'listItem';
  }
  if (hasSchedule(signals)) {
    if (hint.kind === 'rankedTask') {
      return 'rankedTask';
    }
    signals.ambiguities.push({ type: 'taskOrEvent' });
    return signals.time !== null && hint.kind === 'calendar' ? 'calendarEvent' : 'rankedTask';
  }
  if (hint.kind === 'futureTask') {
    return 'futureTask';
  }
  if (hint.kind === 'rankedTask') {
    return 'rankedTask';
  }
  if (hint.kind === 'calendar' && cleanTitle(signals.text).length > 0) {
    signals.ambiguities.push({ type: 'taskOrEvent' });
    return 'rankedTask';
  }
  return 'unknown';
}

function hintDate(context: VoiceParseContext): string | null {
  return context.hint.kind === 'rankedTask' || context.hint.kind === 'calendar'
    ? context.hint.date
    : null;
}

function missingFieldsFor(draft: Omit<VoiceCommandDraft, 'missingFields' | 'confidence'>): VoiceField[] {
  const missing: VoiceField[] = [];
  if (draft.kind === 'unknown') {
    missing.push('kind');
  }
  if (draft.title === null) {
    missing.push('title');
  }
  if (draft.kind === 'listItem' && draft.targetListId === null) {
    missing.push('targetList');
  }
  if (draft.kind === 'rankedTask') {
    if (draft.date === null) {
      missing.push('date');
    }
    if (draft.priority === null) {
      missing.push('priority');
    }
  }
  if (draft.kind === 'calendarEvent') {
    if (draft.eventStart === null) {
      missing.push('eventStart');
    }
    if (draft.eventEnd === null) {
      missing.push('eventEnd');
    }
  }
  return missing;
}

function confidenceFor(
  kind: VoiceCommandKind,
  missing: number,
  ambiguities: number,
  speechConfidence: number | undefined,
): number {
  const base = kind === 'unknown' ? 0.2 : 0.9;
  const penalized = base - missing * 0.1 - ambiguities * 0.15;
  const speech = speechConfidence === undefined || speechConfidence <= 0 ? 1 : speechConfidence;
  return Math.round(Math.min(1, Math.max(0, penalized * speech)) * 100) / 100;
}

function emptyDraft(transcript: string, language: VoiceLanguage): VoiceCommandDraft {
  return {
    kind: 'unknown',
    transcript,
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
    missingFields: ['kind', 'title'],
    ambiguities: [],
    confidence: 0,
  };
}

export function parseVoiceCommand(transcript: string, context: VoiceParseContext): VoiceParseOutcome {
  const original = collapseSpaces(transcript);
  const { text: withoutWake, hadWakePhrase } = stripWakePhrase(original, context.wakePhrases);
  if (context.mode === 'handsFree' && !hadWakePhrase) {
    return { status: 'ignored', reason: 'missingWakePhrase' };
  }
  const language = detectLanguage(original, context.preferredLanguage);
  if (cleanTitle(withoutWake).length === 0) {
    return hadWakePhrase
      ? { status: 'parsed', draft: emptyDraft(original, language), hadWakePhrase }
      : { status: 'ignored', reason: 'empty' };
  }

  const today = toLocalDate(context.now, context.timeZone);
  const signals: Signals = {
    text: withoutWake.replace(/ё/g, 'е').replace(/Ё/g, 'Е'),
    priority: null,
    durationMinutes: null,
    range: null,
    time: null,
    date: null,
    dayPeriod: null,
    reminderRequested: false,
    futureKeyword: false,
    taskKeyword: false,
    eventKeyword: false,
    commandVerb: false,
    listTarget: null,
    quantity: null,
    unit: null,
    ambiguities: [],
  };

  signals.reminderRequested = takeFlag(
    signals,
    pattern(`^\\s*(?:please\\s+|пожалуйста\\s+)?(?:remind\\s+me|напомни(?:те)?(?:\\s+мне)?)${WORD_END}`),
  );
  signals.commandVerb = takeFlag(signals, COMMAND_VERBS) || signals.reminderRequested;
  extractPriority(signals);
  extractExplicitList(signals);
  extractSchedule(signals, today);
  signals.futureKeyword = takeFlag(
    signals,
    pattern(
      `${WORD_START}(?:(?:a|an)\\s+)?(?:future\\s+task|someday|some\\s+day|sometime|in\\s+the\\s+future|когда[\\s-]нибудь|в\\s+будущем|на\\s+будущее)${WORD_END}`,
    ),
  );
  signals.eventKeyword = takeFlag(
    signals,
    pattern(`${WORD_START}(?:(?:an?|new|calendar)\\s+)*(?:event|событие|мероприятие)${WORD_END}`),
  );
  signals.eventKeyword =
    signals.eventKeyword ||
    pattern(`${WORD_START}(?:meeting|appointment|встреч[аиуе]|созвон)${WORD_END}`).test(signals.text);
  signals.taskKeyword = takeFlag(
    signals,
    pattern(`${WORD_START}(?:(?:a|an|new)\\s+)?(?:task|задач[уаи])${WORD_END}`),
  );
  if (
    signals.listTarget === null &&
    signals.commandVerb &&
    !signals.reminderRequested &&
    !signals.taskKeyword &&
    !signals.futureKeyword &&
    !signals.eventKeyword &&
    signals.priority === null &&
    !hasSchedule(signals) &&
    signals.ambiguities.length === 0
  ) {
    extractTailList(signals);
  }

  const kind = decideKind(signals, context);
  let title = cleanTitle(signals.text);
  if (kind === 'listItem') {
    const counted = extractQuantity(trimEdgePunctuation(signals.text));
    title = cleanTitle(counted.title);
    signals.quantity = counted.quantity;
    signals.unit = counted.unit;
  }

  let targetListId: string | null = null;
  let targetListName: string | null = null;
  if (kind === 'listItem') {
    if (signals.listTarget !== null) {
      const match = matchListTarget(signals.listTarget, context.lists);
      targetListName = match.listName;
      if (match.status === 'found') {
        targetListId = match.listId;
      } else {
        signals.ambiguities.push(match.ambiguity);
      }
    } else if (context.hint.kind === 'listItem') {
      targetListId = context.hint.listId;
      targetListName = context.lists.find((list) => list.id === targetListId)?.title ?? null;
    }
  }

  const scheduledDate =
    signals.date ??
    (kind === 'rankedTask' || kind === 'calendarEvent' ? hintDate(context) : null) ??
    (kind === 'rankedTask' && signals.reminderRequested && signals.time !== null ? today : null);

  let reminder: VoiceReminderDraft | null = null;
  let exactTime: string | null = null;
  let dayPeriod: DayPeriod | null = null;
  if (kind === 'rankedTask' || kind === 'futureTask') {
    if (signals.reminderRequested && signals.time !== null && scheduledDate !== null) {
      reminder = { type: 'exact', localDateTime: `${scheduledDate}T${signals.time}` };
    } else if (signals.reminderRequested && signals.dayPeriod !== null) {
      reminder = { type: 'dayPeriod', period: signals.dayPeriod };
      dayPeriod = signals.dayPeriod;
    } else {
      exactTime = signals.time;
      dayPeriod = signals.time === null ? signals.dayPeriod : null;
    }
  }

  let eventStart: string | null = null;
  let eventEnd: string | null = null;
  if (kind === 'calendarEvent' && scheduledDate !== null) {
    const startTime = signals.range?.start ?? signals.time;
    if (startTime !== null) {
      eventStart = `${scheduledDate}T${startTime}`;
      if (signals.range !== null) {
        eventEnd =
          signals.range.end > signals.range.start
            ? `${scheduledDate}T${signals.range.end}`
            : addMinutesToLocalDateTime(`${scheduledDate}T${signals.range.end}`, 24 * 60);
      } else if (signals.durationMinutes !== null) {
        eventEnd = addMinutesToLocalDateTime(eventStart, signals.durationMinutes);
      } else {
        const suggestedEnd = addMinutesToLocalDateTime(eventStart, VOICE_CONFIG.suggestedEventMinutes);
        eventEnd = suggestedEnd;
        signals.ambiguities.push({ type: 'eventEndSuggested', suggestedEnd });
      }
    }
  }

  const base = {
    kind,
    transcript: original,
    language,
    title: title.length === 0 ? null : capitalize(title),
    targetListId,
    targetListName,
    date: kind === 'rankedTask' || kind === 'calendarEvent' ? scheduledDate : null,
    priority: kind === 'rankedTask' ? signals.priority : null,
    exactTime,
    dayPeriod,
    eventStart,
    eventEnd,
    reminder,
    quantity: kind === 'listItem' ? signals.quantity : null,
    unit: kind === 'listItem' ? signals.unit : null,
    ambiguities: signals.ambiguities,
  };
  const missingFields = missingFieldsFor(base);
  return {
    status: 'parsed',
    hadWakePhrase,
    draft: {
      ...base,
      missingFields,
      confidence: confidenceFor(
        kind,
        missingFields.length,
        signals.ambiguities.length,
        context.speechConfidence,
      ),
    },
  };
}
