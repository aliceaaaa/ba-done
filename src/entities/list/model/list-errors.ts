import type { ListField } from './types';

export type ListValidationIssue = {
  field: ListField;
  message: string;
};

export type ListValidationError = {
  type: 'ValidationError';
  issues: ListValidationIssue[];
  message: string;
};

export type ListNotFound = {
  type: 'ListNotFound';
  id: string;
  message: string;
};

export type ListItemNotFound = {
  type: 'ListItemNotFound';
  id: string;
  message: string;
};

export type ListArchived = {
  type: 'ListArchived';
  id: string;
  message: string;
};

export type ShoppingListRequired = {
  type: 'ShoppingListRequired';
  id: string;
  message: string;
};

export type ItemMoveNotAllowed = {
  type: 'ItemMoveNotAllowed';
  id: string;
  message: string;
};

export type ListError =
  | ListValidationError
  | ListNotFound
  | ListItemNotFound
  | ListArchived
  | ShoppingListRequired
  | ItemMoveNotAllowed;

export const LIST_MESSAGES = {
  titleRequired: 'Title is required',
  invalidKind: 'Choose a list type',
  invalidColor: 'Choose a color',
  invalidIcon: 'Choose an icon',
  invalidQuantity: 'Quantity must be a number greater than 0',
  listNotFound: 'This list no longer exists',
  itemNotFound: 'This item no longer exists',
  listArchived: 'This list is archived. Restore it to change its items.',
  shoppingListRequired: 'Shopping cannot be deleted while it is your only shopping list.',
  moveNotAllowed: 'This item cannot be moved further',
} as const;

export function listValidationError(issues: ListValidationIssue[]): ListValidationError {
  return {
    type: 'ValidationError',
    issues,
    message: issues.map((issue) => issue.message).join('\n'),
  };
}

export function listNotFound(id: string): ListNotFound {
  return { type: 'ListNotFound', id, message: LIST_MESSAGES.listNotFound };
}

export function listItemNotFound(id: string): ListItemNotFound {
  return { type: 'ListItemNotFound', id, message: LIST_MESSAGES.itemNotFound };
}

export function listArchived(id: string): ListArchived {
  return { type: 'ListArchived', id, message: LIST_MESSAGES.listArchived };
}

export function shoppingListRequired(id: string): ShoppingListRequired {
  return { type: 'ShoppingListRequired', id, message: LIST_MESSAGES.shoppingListRequired };
}

export function itemMoveNotAllowed(id: string): ItemMoveNotAllowed {
  return { type: 'ItemMoveNotAllowed', id, message: LIST_MESSAGES.moveNotAllowed };
}

export function describeListError(error: ListError): string {
  return error.message;
}
