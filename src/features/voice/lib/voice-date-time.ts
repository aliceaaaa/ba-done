import type { DayPeriod } from '@/entities/task';
import { addDays, dayOfWeek, isValidLocalDate, startOfWeek } from '@/shared/lib/local-date';

import {
  NUMBER_PATTERN,
  WORD_END,
  WORD_START,
  extract,
  foldText,
  parseNumber,
  pattern,
  type Extraction,
} from './voice-text';

export type DateExtraction = { date: string; period?: DayPeriod } | { invalid: string };

export type TimeExtraction = { time: string } | { invalid: string };

export type TimeRangeExtraction = { start: string; end: string } | { invalid: string };

const EN_MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const RU_MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среда: 3,
  среду: 3,
  четверг: 4,
  пятница: 5,
  пятницу: 5,
  суббота: 6,
  субботу: 6,
};

const EN_WEEKDAY_PATTERN = Object.keys(WEEKDAYS)
  .filter((name) => /^[a-z]+$/.test(name))
  .join('|');
const RU_WEEKDAY_PATTERN = Object.keys(WEEKDAYS)
  .filter((name) => !/^[a-z]+$/.test(name))
  .join('|');
const MONTH_PATTERN = [...EN_MONTHS, ...RU_MONTHS].join('|');

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function monthIndex(name: string): number {
  const folded = foldText(name);
  const en = EN_MONTHS.indexOf(folded);
  return en >= 0 ? en + 1 : RU_MONTHS.indexOf(folded) + 1;
}

function weekdayDate(today: string, weekday: number, modifier: string | undefined): string {
  const folded = modifier === undefined ? '' : foldText(modifier);
  if (folded === 'next' || folded.startsWith('следующ')) {
    return addDays(startOfWeek(today), 7 + ((weekday + 6) % 7));
  }
  return addDays(today, (weekday - dayOfWeek(today) + 7) % 7);
}

function monthDayDate(
  today: string,
  day: string,
  month: string,
  year: string | undefined,
): DateExtraction {
  const date = `${year ?? today.slice(0, 4)}-${pad(monthIndex(month))}-${pad(Number(day))}`;
  return isValidLocalDate(date) ? { date } : { invalid: `${day} ${month}` };
}

export function extractDate(text: string, today: string): Extraction<DateExtraction> | null {
  const readers: [RegExp, (match: RegExpExecArray) => DateExtraction | null][] = [
    [
      pattern(`${WORD_START}(?:for\\s+|on\\s+)?(?:the\\s+)?day\\s+after\\s+tomorrow${WORD_END}`),
      () => ({ date: addDays(today, 2) }),
    ],
    [
      pattern(`${WORD_START}(?:на\\s+)?(сегодня|завтра|послезавтра)${WORD_END}`),
      (match) => {
        const word = foldText(match[1] ?? '');
        return { date: addDays(today, word === 'сегодня' ? 0 : word === 'завтра' ? 1 : 2) };
      },
    ],
    [
      pattern(`${WORD_START}(?:for\\s+|on\\s+)?(today|tomorrow)${WORD_END}`),
      (match) => ({ date: addDays(today, foldText(match[1] ?? '') === 'today' ? 0 : 1) }),
    ],
    [pattern(`${WORD_START}tonight${WORD_END}`), () => ({ date: today, period: 'night' })],
    [
      pattern(`${WORD_START}in\\s+(${NUMBER_PATTERN}|a)\\s+(days?|weeks?)${WORD_END}`),
      (match) => {
        const count = foldText(match[1] ?? '') === 'a' ? 1 : parseNumber(match[1] ?? '');
        if (count === null || !Number.isInteger(count)) {
          return null;
        }
        return {
          date: addDays(today, foldText(match[2] ?? '').startsWith('week') ? count * 7 : count),
        };
      },
    ],
    [
      pattern(
        `${WORD_START}через\\s+(?:(${NUMBER_PATTERN})\\s+)?(день|дня|дней|неделю|недели|недель)${WORD_END}`,
      ),
      (match) => {
        const count = match[1] === undefined ? 1 : parseNumber(match[1]);
        if (count === null || !Number.isInteger(count)) {
          return null;
        }
        return {
          date: addDays(today, foldText(match[2] ?? '').startsWith('недел') ? count * 7 : count),
        };
      },
    ],
    [
      pattern(
        `${WORD_START}(?:на\\s+|к\\s+)?(\\d{1,2})(?:-?(?:го|е))?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4})(?:\\s+года)?)?${WORD_END}`,
      ),
      (match) => monthDayDate(today, match[1] ?? '', match[2] ?? '', match[3]),
    ],
    [
      pattern(
        `${WORD_START}(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})(?:,?\\s+(\\d{4}))?${WORD_END}`,
      ),
      (match) => monthDayDate(today, match[1] ?? '', match[2] ?? '', match[3]),
    ],
    [
      pattern(
        `${WORD_START}(?:on\\s+)?(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${WORD_END}`,
      ),
      (match) => monthDayDate(today, match[2] ?? '', match[1] ?? '', match[3]),
    ],
    [
      pattern(
        `${WORD_START}(?:(?:в|во|на)\\s+)?(?:(эту|этот|это|следующую|следующий|следующее)\\s+)?(${RU_WEEKDAY_PATTERN})${WORD_END}`,
      ),
      (match) => {
        const weekday = WEEKDAYS[foldText(match[2] ?? '')];
        return weekday === undefined ? null : { date: weekdayDate(today, weekday, match[1]) };
      },
    ],
    [
      pattern(
        `${WORD_START}(?:on\\s+)?(?:(this|next|coming)\\s+)?(${EN_WEEKDAY_PATTERN})${WORD_END}`,
      ),
      (match) => {
        const weekday = WEEKDAYS[foldText(match[2] ?? '')];
        return weekday === undefined ? null : { date: weekdayDate(today, weekday, match[1]) };
      },
    ],
  ];
  for (const [regex, read] of readers) {
    const found = extract(text, regex, read);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

const EN_TIME = `(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)?`;
const RU_HOUR = `(\\d{1,2}|${NUMBER_PATTERN})`;
const RU_TIME = `${RU_HOUR}(?:[:.](\\d{2}))?(?:\\s*час(?:а|ов)?)?(?:\\s+(утра|дня|вечера|ночи))?`;

function toTime(hour: number, minute: number): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? `${pad(hour)}:${pad(minute)}`
    : null;
}

type ClockParts = {
  hour: number;
  minute: number;
  meridiem: 'am' | 'pm' | null;
};

function englishParts(hour?: string, minute?: string, meridiem?: string): ClockParts | null {
  const h = Number(hour);
  const m = minute === undefined ? 0 : Number(minute);
  if (!Number.isFinite(h)) {
    return null;
  }
  const folded = meridiem === undefined ? null : foldText(meridiem).replace(/[^ap]/g, '');
  return { hour: h, minute: m, meridiem: folded === 'a' ? 'am' : folded === 'p' ? 'pm' : null };
}

function russianParts(hour?: string, minute?: string, period?: string): ClockParts | null {
  const h = parseNumber(hour ?? '');
  if (h === null) {
    return null;
  }
  const m = minute === undefined ? 0 : Number(minute);
  const folded = period === undefined ? null : foldText(period);
  if (folded === 'дня' || folded === 'вечера') {
    return { hour: h, minute: m, meridiem: 'pm' };
  }
  if (folded === 'утра' || (folded === 'ночи' && (h === 12 || h < 6))) {
    return { hour: h, minute: m, meridiem: 'am' };
  }
  if (folded === 'ночи') {
    return { hour: h, minute: m, meridiem: 'pm' };
  }
  return { hour: h, minute: m, meridiem: null };
}

function clockTime(parts: ClockParts): string | null {
  if (parts.meridiem === null) {
    return toTime(parts.hour, parts.minute);
  }
  if (parts.hour < 1 || parts.hour > 12) {
    return null;
  }
  const base = parts.hour % 12;
  return toTime(parts.meridiem === 'pm' ? base + 12 : base, parts.minute);
}

function rangeFrom(start: ClockParts, end: ClockParts, matched: string): TimeRangeExtraction {
  const endTime = clockTime(end);
  const inherits =
    start.meridiem === null && end.meridiem !== null && start.hour >= 1 && start.hour <= 12;
  const candidates = (
    inherits
      ? [
          clockTime({ ...start, meridiem: end.meridiem }),
          clockTime({ ...start, meridiem: 'am' }),
          clockTime(start),
        ]
      : [clockTime(start)]
  ).filter((candidate): candidate is string => candidate !== null);
  if (endTime === null || candidates.length === 0) {
    return { invalid: matched };
  }
  const startTime = candidates.find((candidate) => candidate < endTime) ?? candidates[0] ?? '';
  if (endTime <= startTime && end.meridiem === null && end.hour < 12) {
    const shifted = toTime(end.hour + 12, end.minute);
    if (shifted !== null && shifted > startTime) {
      return { start: startTime, end: shifted };
    }
  }
  return { start: startTime, end: endTime };
}

export function extractTimeRange(text: string): Extraction<TimeRangeExtraction> | null {
  const english = extract(
    text,
    pattern(
      `${WORD_START}(?:from|between)\\s+${EN_TIME}\\s*(?:to|till|until|and|-|–)\\s*${EN_TIME}(?![\\p{L}\\p{N}])`,
    ),
    (match) => {
      const start = englishParts(match[1], match[2], match[3]);
      const end = englishParts(match[4], match[5], match[6]);
      return start === null || end === null ? null : rangeFrom(start, end, match[0].trim());
    },
  );
  if (english !== null) {
    return english;
  }
  return extract(
    text,
    pattern(`${WORD_START}(?:с|со)\\s+${RU_TIME}\\s+(?:до|по)\\s+${RU_TIME}${WORD_END}`),
    (match) => {
      const start = russianParts(match[1], match[2], match[3]);
      const end = russianParts(match[4], match[5], match[6]);
      return start === null || end === null ? null : rangeFrom(start, end, match[0].trim());
    },
  );
}

export function extractTime(text: string): Extraction<TimeExtraction> | null {
  const readers: [RegExp, (match: RegExpExecArray) => TimeExtraction | null][] = [
    [
      pattern(`${WORD_START}(?:at\\s+)?(noon|midnight)${WORD_END}`),
      (match) => ({ time: foldText(match[1] ?? '') === 'noon' ? '12:00' : '00:00' }),
    ],
    [
      pattern(`${WORD_START}at\\s+${EN_TIME}(?![\\p{L}\\p{N}])`),
      (match) => {
        const parts = englishParts(match[1], match[2], match[3]);
        const time = parts === null ? null : clockTime(parts);
        return time === null ? { invalid: match[0].trim() } : { time };
      },
    ],
    [
      pattern(
        `${WORD_START}(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)(?![\\p{L}\\p{N}])`,
      ),
      (match) => {
        const parts = englishParts(match[1], match[2], match[3]);
        const time = parts === null ? null : clockTime(parts);
        return time === null ? { invalid: match[0].trim() } : { time };
      },
    ],
    [
      pattern(
        `${WORD_START}(?:в|во|к)\\s+(\\d{1,2})(?:[:.](\\d{2}))?(?:\\s*час(?:а|ов)?)?(?:\\s+(утра|дня|вечера|ночи))?${WORD_END}`,
      ),
      (match) => {
        const parts = russianParts(match[1], match[2], match[3]);
        const time = parts === null ? null : clockTime(parts);
        return time === null ? { invalid: match[0].trim() } : { time };
      },
    ],
    [
      pattern(
        `${WORD_START}(?:в|во|к)\\s+(${NUMBER_PATTERN})\\s*(?:час(?:а|ов)?(?:\\s+(утра|дня|вечера|ночи))?|(утра|дня|вечера|ночи))${WORD_END}`,
      ),
      (match) => {
        const parts = russianParts(match[1], undefined, match[2] ?? match[3]);
        const time = parts === null ? null : clockTime(parts);
        return time === null ? { invalid: match[0].trim() } : { time };
      },
    ],
    [
      pattern(`${WORD_START}(\\d{1,2}):(\\d{2})${WORD_END}`),
      (match) => {
        const time = toTime(Number(match[1]), Number(match[2]));
        return time === null ? { invalid: match[0].trim() } : { time };
      },
    ],
  ];
  for (const [regex, read] of readers) {
    const found = extract(text, regex, read);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

export function extractDuration(text: string): Extraction<number> | null {
  const readers: [RegExp, (match: RegExpExecArray) => number | null][] = [
    [pattern(`${WORD_START}for\\s+(?:a\\s+)?half\\s+(?:an\\s+)?hour${WORD_END}`), () => 30],
    [pattern(`${WORD_START}на\\s+полчаса${WORD_END}`), () => 30],
    [
      pattern(
        `${WORD_START}for\\s+(?:(an|a|${NUMBER_PATTERN})\\s+)?(hours?|minutes?|mins?)(\\s+and\\s+a\\s+half)?${WORD_END}`,
      ),
      (match) => {
        const raw = match[1] === undefined ? 'one' : match[1];
        const count = ['a', 'an'].includes(foldText(raw)) ? 1 : parseNumber(raw);
        if (count === null) {
          return null;
        }
        const total = count + (match[3] === undefined ? 0 : 0.5);
        return Math.round(foldText(match[2] ?? '').startsWith('hour') ? total * 60 : total);
      },
    ],
    [
      pattern(
        `${WORD_START}на\\s+(?:(${NUMBER_PATTERN})\\s+)?(час|часа|часов|минуту|минуты|минут|мин)${WORD_END}`,
      ),
      (match) => {
        const count = match[1] === undefined ? 1 : parseNumber(match[1]);
        if (count === null) {
          return null;
        }
        return Math.round(foldText(match[2] ?? '').startsWith('час') ? count * 60 : count);
      },
    ],
  ];
  for (const [regex, read] of readers) {
    const found = extract(text, regex, read);
    if (found !== null && found.value > 0) {
      return found;
    }
  }
  return null;
}

const PERIODS: Record<string, DayPeriod> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
  утром: 'morning',
  днем: 'afternoon',
  вечером: 'evening',
  ночью: 'night',
};

export function extractDayPeriod(text: string): Extraction<DayPeriod> | null {
  return (
    extract(
      text,
      pattern(`${WORD_START}(?:in\\s+the\\s+|this\\s+)?(morning|afternoon|evening)${WORD_END}`),
      (match) => PERIODS[foldText(match[1] ?? '')] ?? null,
    ) ??
    extract(text, pattern(`${WORD_START}at\\s+night${WORD_END}`), () => 'night' as const) ??
    extract(
      text,
      pattern(`${WORD_START}(утром|днем|вечером|ночью)${WORD_END}`),
      (match) => PERIODS[foldText(match[1] ?? '')] ?? null,
    )
  );
}
