import { colors } from '@/shared/ui/theme';

import type { ListColor, ListIcon, ListItem, ListKind } from '../model/types';

export const LIST_ICON_SYMBOLS: Record<ListIcon, string> = {
  cart: '🛒',
  checklist: '📝',
  pill: '💊',
  gift: '🎁',
  home: '🏠',
  star: '⭐',
};

export const LIST_ICON_LABELS: Record<ListIcon, string> = {
  cart: 'Cart',
  checklist: 'Checklist',
  pill: 'Pharmacy',
  gift: 'Gift',
  home: 'Home',
  star: 'Star',
};

export const LIST_COLOR_VALUES: Record<ListColor, string> = {
  blue: colors.accent,
  green: colors.done,
  orange: colors.notTonight,
  pink: colors.event,
  purple: '#7C3AED',
  gray: colors.muted,
};

export const LIST_COLOR_LABELS: Record<ListColor, string> = {
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  pink: 'Pink',
  purple: 'Purple',
  gray: 'Gray',
};

export const LIST_KIND_LABELS: Record<ListKind, string> = {
  shopping: 'Shopping list',
  custom: 'Custom list',
};

const quantityFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

export function formatQuantity(item: Pick<ListItem, 'quantity' | 'unit'>): string | null {
  if (item.quantity === null && item.unit === null) {
    return null;
  }
  const amount = item.quantity === null ? null : quantityFormatter.format(item.quantity);
  return [amount, item.unit].filter((part) => part !== null).join(' ');
}

export function formatActiveCount(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

export function parseQuantityText(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed.length === 0) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 'invalid';
}
