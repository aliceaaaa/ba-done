import { err, ok, type Result } from '@/shared/lib/result';

import {
  LIST_MESSAGES,
  listValidationError,
  type ListValidationError,
  type ListValidationIssue,
} from './list-errors';
import {
  LIST_COLORS,
  LIST_ICONS,
  LIST_KINDS,
  type ListColor,
  type ListIcon,
  type ListKind,
} from './types';

export type ValidListFields = {
  title: string;
  kind: ListKind;
  color: ListColor;
  icon: ListIcon;
};

export type ValidItemFields = {
  title: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

export function validateListFields(
  fields: ValidListFields,
): Result<ValidListFields, ListValidationError> {
  const issues: ListValidationIssue[] = [];
  const title = fields.title.trim();
  if (title.length === 0) {
    issues.push({ field: 'title', message: LIST_MESSAGES.titleRequired });
  }
  if (!includes(LIST_KINDS, fields.kind)) {
    issues.push({ field: 'kind', message: LIST_MESSAGES.invalidKind });
  }
  if (!includes(LIST_COLORS, fields.color)) {
    issues.push({ field: 'color', message: LIST_MESSAGES.invalidColor });
  }
  if (!includes(LIST_ICONS, fields.icon)) {
    issues.push({ field: 'icon', message: LIST_MESSAGES.invalidIcon });
  }
  return issues.length > 0 ? err(listValidationError(issues)) : ok({ ...fields, title });
}

export function validateItemFields(
  fields: ValidItemFields,
): Result<ValidItemFields, ListValidationError> {
  const issues: ListValidationIssue[] = [];
  const title = fields.title.trim();
  if (title.length === 0) {
    issues.push({ field: 'title', message: LIST_MESSAGES.titleRequired });
  }
  if (fields.quantity !== null && !(Number.isFinite(fields.quantity) && fields.quantity > 0)) {
    issues.push({ field: 'quantity', message: LIST_MESSAGES.invalidQuantity });
  }
  if (issues.length > 0) {
    return err(listValidationError(issues));
  }
  return ok({
    title,
    quantity: fields.quantity,
    unit: normalizeOptionalText(fields.unit),
    note: normalizeOptionalText(fields.note),
  });
}
