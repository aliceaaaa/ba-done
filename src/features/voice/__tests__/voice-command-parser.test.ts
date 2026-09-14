import { VOICE_CONFIG } from '@/shared/config/voice-config';

import type {
  VoiceCommandDraft,
  VoiceCommandHint,
  VoiceListOption,
  VoiceParseContext,
} from '../model/voice-command';
import { parseVoiceCommand } from '../model/voice-command-parser';

const NOW = new Date('2026-09-11T08:00:00.000Z');
const TODAY = '2026-09-11';
const TOMORROW = '2026-09-12';
const FRIDAY_NEXT_WEEK = '2026-09-18';

const LISTS: VoiceListOption[] = [
  { id: 'shopping', title: 'Shopping', kind: 'shopping' },
  { id: 'pharmacy', title: 'Аптека', kind: 'custom' },
  { id: 'trip', title: 'Trip', kind: 'custom' },
];

function context(overrides: Partial<VoiceParseContext> = {}): VoiceParseContext {
  return {
    now: NOW,
    timeZone: 'Europe/Berlin',
    mode: 'manual',
    wakePhrases: VOICE_CONFIG.wakePhrases,
    hint: { kind: 'none' },
    lists: LISTS,
    ...overrides,
  };
}

function parse(transcript: string, overrides: Partial<VoiceParseContext> = {}): VoiceCommandDraft {
  const outcome = parseVoiceCommand(transcript, context(overrides));
  if (outcome.status !== 'parsed') {
    throw new Error(`Expected "${transcript}" to be parsed, got ${outcome.reason}`);
  }
  return outcome.draft;
}

function withHint(hint: VoiceCommandHint): Partial<VoiceParseContext> {
  return { hint };
}

describe('parseVoiceCommand', () => {
  describe('list items', () => {
    it('parses a Russian shopping list command with the wake phrase', () => {
      const draft = parse('Эй, приложение, добавь масло в список покупок');

      expect(draft).toMatchObject({
        kind: 'listItem',
        language: 'ru',
        title: 'Масло',
        targetListId: 'shopping',
        quantity: null,
        unit: null,
        missingFields: [],
        ambiguities: [],
      });
    });

    it('parses a Russian item with quantity, unit and a list named in Latin letters', () => {
      expect(parse('Добавь две бутылки воды в Shopping')).toMatchObject({
        kind: 'listItem',
        title: 'Воды',
        quantity: 2,
        unit: 'бутылки',
        targetListId: 'shopping',
      });
    });

    it('parses the "list — item" form and matches an inflected list name', () => {
      expect(parse('В список аптека — аспирин')).toMatchObject({
        kind: 'listItem',
        title: 'Аспирин',
        targetListId: 'pharmacy',
      });
      expect(parse('Добавь пластырь в список аптеки')).toMatchObject({
        title: 'Пластырь',
        targetListId: 'pharmacy',
      });
    });

    it('parses an English shopping command', () => {
      expect(parse('Hey app, add milk to Shopping')).toMatchObject({
        kind: 'listItem',
        language: 'en',
        title: 'Milk',
        targetListId: 'shopping',
        missingFields: [],
      });
      expect(parse('Add eggs to my shopping list')).toMatchObject({
        title: 'Eggs',
        targetListId: 'shopping',
      });
    });

    it('extracts English quantity and unit', () => {
      expect(parse('Add three bottles of water to Shopping')).toMatchObject({
        kind: 'listItem',
        title: 'Water',
        quantity: 3,
        unit: 'bottles',
      });
      expect(parse('Add bananas, 2 kg to Shopping')).toMatchObject({
        title: 'Bananas',
        quantity: 2,
        unit: 'kg',
      });
    });

    it('reports an unknown list instead of creating one', () => {
      const draft = parse('Add three bottles of water to Groceries');

      expect(draft).toMatchObject({
        kind: 'listItem',
        targetListId: null,
        targetListName: 'Groceries',
        missingFields: ['targetList'],
        ambiguities: [{ type: 'listNotFound', listName: 'Groceries' }],
      });
    });

    it('asks to choose between lists with similar names', () => {
      const lists: VoiceListOption[] = [
        ...LISTS.filter((list) => list.id !== 'trip'),
        { id: 'italy', title: 'Trip Italy', kind: 'custom' },
        { id: 'spain', title: 'Trip Spain', kind: 'custom' },
      ];
      const draft = parse('Add sunscreen to trip list', { lists });

      expect(draft.ambiguities).toEqual([
        { type: 'multipleLists', listName: 'trip', candidateIds: ['italy', 'spain'] },
      ]);
      expect(draft.targetListId).toBeNull();
    });

    it('uses the open list when the microphone is pressed inside a list', () => {
      expect(parse('bread', withHint({ kind: 'listItem', listId: 'trip' }))).toMatchObject({
        kind: 'listItem',
        title: 'Bread',
        targetListId: 'trip',
        missingFields: [],
      });
    });
  });

  describe('Future tasks', () => {
    it('creates a Future task without a date or priority from an explicit task', () => {
      expect(parse('Добавь задачу забрать куртку')).toMatchObject({
        kind: 'futureTask',
        title: 'Забрать куртку',
        date: null,
        priority: null,
        missingFields: [],
        ambiguities: [],
      });
    });

    it('recognizes someday phrases', () => {
      expect(parse('Когда-нибудь купить новый чемодан')).toMatchObject({
        kind: 'futureTask',
        title: 'Купить новый чемодан',
      });
      expect(parse('Add a future task to renew my passport')).toMatchObject({
        kind: 'futureTask',
        title: 'Renew my passport',
        date: null,
        priority: null,
      });
    });
  });

  describe('ranked tasks', () => {
    it('parses a date and a priority', () => {
      expect(parse('Добавь на сегодня забрать посылку, приоритет три')).toMatchObject({
        kind: 'rankedTask',
        title: 'Забрать посылку',
        date: TODAY,
        priority: 3,
        missingFields: [],
      });
      expect(parse('Завтра позвонить маме, приоритет семь')).toMatchObject({
        kind: 'rankedTask',
        title: 'Позвонить маме',
        date: TOMORROW,
        priority: 7,
      });
      expect(parse('Add call John tomorrow with priority four')).toMatchObject({
        kind: 'rankedTask',
        title: 'Call John',
        date: TOMORROW,
        priority: 4,
        missingFields: [],
      });
    });

    it('lists missing priority instead of guessing', () => {
      const draft = parse('Remind me tomorrow at 9 to send the report');

      expect(draft.kind).toBe('rankedTask');
      expect(draft.priority).toBeNull();
      expect(draft.missingFields).toEqual(['priority']);
    });
  });

  describe('calendar events', () => {
    it('parses a start and an end', () => {
      expect(parse('Создай событие стоматолог в пятницу с 12 до 13')).toMatchObject({
        kind: 'calendarEvent',
        title: 'Стоматолог',
        date: TODAY,
        eventStart: '2026-09-11T12:00',
        eventEnd: '2026-09-11T13:00',
        missingFields: [],
        ambiguities: [],
      });
    });

    it('parses a start and a duration', () => {
      expect(parse('Встреча с Анной завтра в 15:00 на час')).toMatchObject({
        kind: 'calendarEvent',
        title: 'Встреча с Анной',
        eventStart: `${TOMORROW}T15:00`,
        eventEnd: `${TOMORROW}T16:00`,
      });
      expect(parse('Create an event tomorrow at 4 PM for 30 minutes')).toMatchObject({
        kind: 'calendarEvent',
        title: null,
        eventStart: `${TOMORROW}T16:00`,
        eventEnd: `${TOMORROW}T16:30`,
        missingFields: ['title'],
      });
    });

    it('suggests an end one hour after the start without treating it as final', () => {
      const draft = parse('Create an event dentist next friday at 9 am');

      expect(draft).toMatchObject({
        kind: 'calendarEvent',
        title: 'Dentist',
        eventStart: `${FRIDAY_NEXT_WEEK}T09:00`,
        eventEnd: `${FRIDAY_NEXT_WEEK}T10:00`,
        ambiguities: [{ type: 'eventEndSuggested', suggestedEnd: `${FRIDAY_NEXT_WEEK}T10:00` }],
      });
    });
  });

  describe('reminders', () => {
    it('parses an exact reminder', () => {
      expect(parse('Напомни сегодня в 18:00 купить билеты')).toMatchObject({
        kind: 'rankedTask',
        title: 'Купить билеты',
        date: TODAY,
        reminder: { type: 'exact', localDateTime: `${TODAY}T18:00` },
        exactTime: null,
      });
      expect(parse('Remind me tomorrow at 9 to send the report')).toMatchObject({
        title: 'Send the report',
        date: TOMORROW,
        reminder: { type: 'exact', localDateTime: `${TOMORROW}T09:00` },
      });
    });

    it('parses a day-period reminder', () => {
      expect(parse('Напомни завтра утром отправить письмо, приоритет два')).toMatchObject({
        kind: 'rankedTask',
        title: 'Отправить письмо',
        date: TOMORROW,
        priority: 2,
        dayPeriod: 'morning',
        reminder: { type: 'dayPeriod', period: 'morning' },
      });
    });

    it('keeps a spoken time of day on a task without inventing a reminder', () => {
      expect(parse('Завтра утром задача отправить письмо, приоритет два')).toMatchObject({
        kind: 'rankedTask',
        title: 'Отправить письмо',
        priority: 2,
        dayPeriod: 'morning',
        reminder: null,
      });
    });
  });

  describe('wake phrase', () => {
    it('removes the wake phrase from the command', () => {
      const outcome = parseVoiceCommand('Hey app, add milk to Shopping', context());

      expect(outcome).toMatchObject({ status: 'parsed', hadWakePhrase: true });
      expect(outcome.status === 'parsed' && outcome.draft.title).toBe('Milk');
      expect(parse('эй приложение добавь хлеб в список покупок').title).toBe('Хлеб');
    });

    it('accepts a command without the wake phrase after a manual press', () => {
      const outcome = parseVoiceCommand('add milk to Shopping', context({ mode: 'manual' }));

      expect(outcome).toMatchObject({ status: 'parsed', hadWakePhrase: false });
    });

    it('ignores a command without the wake phrase in hands-free mode', () => {
      expect(parseVoiceCommand('add milk to Shopping', context({ mode: 'handsFree' }))).toEqual({
        status: 'ignored',
        reason: 'missingWakePhrase',
      });
      expect(
        parseVoiceCommand('Hey app add milk to Shopping', context({ mode: 'handsFree' })),
      ).toMatchObject({ status: 'parsed' });
    });

    it('uses the configured wake phrases', () => {
      const custom = context({ wakePhrases: [{ phrase: 'Hello Planner' }], mode: 'handsFree' });

      expect(parseVoiceCommand('Hey app add milk to Shopping', custom).status).toBe('ignored');
      expect(parseVoiceCommand('Hello, Planner! Add milk to Shopping', custom)).toMatchObject({
        status: 'parsed',
        draft: { title: 'Milk' },
      });
    });
  });

  describe('incomplete and unknown commands', () => {
    it('returns unknown for an unrecognized command', () => {
      expect(parse('What is the weather like')).toMatchObject({
        kind: 'unknown',
        missingFields: ['kind'],
      });
      expect(parse('Hey app')).toMatchObject({ kind: 'unknown', missingFields: ['kind', 'title'] });
    });

    it('lists missing fields', () => {
      expect(parse('Add a task with priority 5')).toMatchObject({
        kind: 'rankedTask',
        missingFields: ['title', 'date'],
      });
    });

    it('keeps the transcript and flags an unrecognized date or time', () => {
      const date = parse('Create an event on 31 February at 10');
      const time = parse('Встреча завтра в 25:00');

      expect(date.transcript).toBe('Create an event on 31 February at 10');
      expect(date.ambiguities).toContainEqual({ type: 'unrecognizedDate', text: '31 February' });
      expect(date.missingFields).toContain('eventStart');
      expect(time.ambiguities).toContainEqual({ type: 'unrecognizedTime', text: 'в 25:00' });
      expect(time.eventStart).toBeNull();
    });

    it('asks whether a dated command is a task or an event', () => {
      const draft = parse('Стоматолог завтра в 12');

      expect(draft.ambiguities).toContainEqual({ type: 'taskOrEvent' });
      expect(draft.date).toBe(TOMORROW);
    });

    it('uses the selected day of Your matches for a task without a date', () => {
      expect(parse('Buy flowers', withHint({ kind: 'rankedTask', date: '2026-09-20' }))).toMatchObject({
        kind: 'rankedTask',
        date: '2026-09-20',
        missingFields: ['priority'],
      });
    });
  });

  describe('clock and time zone', () => {
    it('resolves relative dates from the injected now', () => {
      const later = new Date('2026-12-31T10:00:00.000Z');

      expect(parse('Tomorrow call mom priority 1', { now: later }).date).toBe('2027-01-01');
      expect(parse('Add call John on Monday with priority 2').date).toBe('2026-09-14');
    });

    it('uses the injected time zone instead of the process time zone', () => {
      const lateEvening = new Date('2026-09-11T23:30:00.000Z');

      expect(parse('Today call mom priority 1', { now: lateEvening, timeZone: 'Asia/Tokyo' }).date).toBe(
        '2026-09-12',
      );
      expect(
        parse('Today call mom priority 1', { now: lateEvening, timeZone: 'America/Los_Angeles' })
          .date,
      ).toBe('2026-09-11');
    });

    it('uses the preferred recognition language only when the text does not reveal it', () => {
      expect(parse('12:30', { preferredLanguage: 'ru', hint: { kind: 'calendar', date: TODAY } }).language).toBe(
        'ru',
      );
      expect(parse('Add milk to Shopping', { preferredLanguage: 'ru' }).language).toBe('en');
    });
  });
});
