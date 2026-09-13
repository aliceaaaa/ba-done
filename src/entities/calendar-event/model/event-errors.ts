import type { EventField } from './types';

export type EventValidationIssue = {
  field: EventField;
  message: string;
};

export type EventValidationError = {
  type: 'ValidationError';
  issues: EventValidationIssue[];
  message: string;
};

export type EventNotFound = {
  type: 'EventNotFound';
  id: string;
  message: string;
};

export type EventError = EventValidationError | EventNotFound;

export const EVENT_MESSAGES = {
  titleRequired: 'Title is required',
  invalidStart: 'Choose a valid start',
  invalidEnd: 'Choose a valid end',
  endBeforeStart: 'End must be after start',
  endDateBeforeStartDate: 'End date cannot be before the start date',
  travelMinutes: 'Travel time must be a non-negative integer',
  invalidReminder: 'Choose a valid reminder date and time',
  reminderInPast: 'Choose a reminder time in the future',
  notFound: 'This event no longer exists',
} as const;

export function eventValidationError(issues: EventValidationIssue[]): EventValidationError {
  return {
    type: 'ValidationError',
    issues,
    message: issues.map((issue) => issue.message).join('\n'),
  };
}

export function eventNotFound(id: string): EventNotFound {
  return { type: 'EventNotFound', id, message: EVENT_MESSAGES.notFound };
}

export function describeEventError(error: EventError): string {
  return error.message;
}
