export const WORD_START = '(?<![\\p{L}\\p{N}])';
export const WORD_END = '(?![\\p{L}\\p{N}])';

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  один: 1,
  одна: 1,
  одну: 1,
  одно: 1,
  одного: 1,
  два: 2,
  две: 2,
  двух: 2,
  три: 3,
  трех: 3,
  четыре: 4,
  четырех: 4,
  пять: 5,
  пяти: 5,
  шесть: 6,
  шести: 6,
  семь: 7,
  семи: 7,
  восемь: 8,
  восьми: 8,
  девять: 9,
  девяти: 9,
  десять: 10,
  десяти: 10,
  одиннадцать: 11,
  двенадцать: 12,
  пол: 0.5,
  полтора: 1.5,
  полторы: 1.5,
  первый: 1,
  второй: 2,
  третий: 3,
  четвертый: 4,
  пятый: 5,
  шестой: 6,
  седьмой: 7,
  восьмой: 8,
  девятый: 9,
  десятый: 10,
};

export const NUMBER_PATTERN = `(?:\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|')})`;

export function foldText(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/ё/g, 'е');
}

export function parseNumber(value: string): number | null {
  const folded = foldText(value.trim());
  if (/^\d+(?:[.,]\d+)?$/.test(folded)) {
    return Number(folded.replace(',', '.'));
  }
  return NUMBER_WORDS[folded] ?? null;
}

export function pattern(source: string): RegExp {
  return new RegExp(source, 'iu');
}

export type Extraction<T> = {
  value: T;
  text: string;
  matched: string;
};

export function extract<T>(
  text: string,
  regex: RegExp,
  read: (match: RegExpExecArray) => T | null,
): Extraction<T> | null {
  const match = regex.exec(text);
  if (match === null) {
    return null;
  }
  const value = read(match);
  if (value === null) {
    return null;
  }
  return {
    value,
    text: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`,
    matched: match[0],
  };
}

export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const EDGE_PUNCTUATION = /^[\s,.;:!?—–\-"'«»]+|[\s,.;:!?—–\-"'«»]+$/gu;

const LEADING_FILLERS = pattern(
  `^(?:to|and|that|for|on|at|with|a|an|the|please|и|в|во|на|с|со|к|что|чтобы|пожалуйста)${WORD_END}`,
);
const TRAILING_FILLERS = pattern(
  `${WORD_START}(?:to|and|for|on|at|with|in|from|и|в|во|на|с|со|к|до|please|пожалуйста)$`,
);

export function trimEdgePunctuation(value: string): string {
  return collapseSpaces(value).replace(EDGE_PUNCTUATION, '');
}

export function cleanTitle(value: string): string {
  let current = collapseSpaces(value).replace(EDGE_PUNCTUATION, '');
  for (;;) {
    const next = collapseSpaces(
      current.replace(LEADING_FILLERS, '').replace(TRAILING_FILLERS, ''),
    ).replace(EDGE_PUNCTUATION, '');
    if (next === current) {
      return next;
    }
    current = next;
  }
}

export function capitalize(value: string): string {
  const [first = '', ...rest] = [...value];
  return `${first.toLocaleUpperCase()}${rest.join('')}`;
}

export function hasCyrillic(value: string): boolean {
  return /\p{Script=Cyrillic}/u.test(value);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
