import { foldText } from '../lib/voice-text';
import type { VoiceAmbiguity, VoiceListOption } from './voice-command';

export type ListTarget = { kind: 'alias'; alias: 'shopping' } | { kind: 'name'; name: string };

export type ListTargetMatch =
  | { status: 'found'; listId: string; listName: string }
  | { status: 'ambiguous'; ambiguity: VoiceAmbiguity; listName: string };

const SHOPPING_ALIASES = ['shopping', 'shopping list', 'покупок', 'покупки', 'список покупок'];

function normalizeName(value: string): string {
  return foldText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:my|the|мой|мои)\s+/u, '')
    .replace(/\s+(?:list|список)$/u, '')
    .trim();
}

function stem(value: string): string {
  return value
    .split(' ')
    .map((word) => (word.length > 4 ? word.slice(0, -1) : word))
    .join(' ')
    .replace(/[аеиоуыэюяьй]+$/u, '');
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length] ?? 0;
}

function isSimilar(spoken: string, title: string): boolean {
  if (spoken.length === 0 || title.length === 0) {
    return false;
  }
  if (stem(spoken) === stem(title)) {
    return true;
  }
  const shorter = Math.min(spoken.length, title.length);
  return (
    (shorter >= 4 && (title.startsWith(spoken) || spoken.startsWith(title))) ||
    (shorter >= 5 && editDistance(spoken, title) <= 2)
  );
}

export function isShoppingAlias(name: string): boolean {
  return SHOPPING_ALIASES.includes(foldText(name).trim());
}

function resolve(listName: string, candidates: readonly VoiceListOption[]): ListTargetMatch {
  const [only, ...others] = candidates;
  if (only !== undefined && others.length === 0) {
    return { status: 'found', listId: only.id, listName: only.title };
  }
  return {
    status: 'ambiguous',
    listName,
    ambiguity: {
      type: 'multipleLists',
      listName,
      candidateIds: candidates.map((list) => list.id),
    },
  };
}

export function matchListTarget(
  target: ListTarget,
  lists: readonly VoiceListOption[],
): ListTargetMatch {
  const spokenName = target.kind === 'alias' ? 'Shopping' : target.name.trim();
  const spoken = normalizeName(spokenName);
  const exact = lists.filter((list) => normalizeName(list.title) === spoken);
  if (exact.length > 0) {
    return resolve(spokenName, exact);
  }
  if (target.kind === 'alias' || isShoppingAlias(spokenName)) {
    const shopping = lists.filter((list) => list.kind === 'shopping');
    if (shopping.length > 0) {
      return resolve(spokenName, shopping);
    }
  }
  const similar = lists.filter((list) => isSimilar(spoken, normalizeName(list.title)));
  if (similar.length > 0) {
    return resolve(spokenName, similar);
  }
  return {
    status: 'ambiguous',
    listName: spokenName,
    ambiguity: { type: 'listNotFound', listName: spokenName },
  };
}
