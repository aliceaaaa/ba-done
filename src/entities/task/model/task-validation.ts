import {
  isValidLocalDate,
  isValidLocalDateTime,
  isValidLocalTime,
  isValidTimeZone,
} from '@/shared/lib/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import { validationError, type TaskValidationError, type ValidationIssue } from './task-errors';
import {
  DAY_PERIODS,
  PRIORITY_MAX,
  PRIORITY_MIN,
  type DayPeriod,
  type RankedSlot,
  type RankedSlotInput,
  type TaskDetails,
  type TaskReminder,
} from './types';

export type DetailsContext = {
  isFuture: boolean;
};

const SCHEDULED: DetailsContext = { isFuture: false };

export function isDayPeriod(value: string): value is DayPeriod {
  return (DAY_PERIODS as readonly string[]).includes(value);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function priorityIssues(priority: number | null): ValidationIssue[] {
  if (priority === null) {
    return [{ field: 'priority', message: 'Choose a priority from 1 to 10' }];
  }
  if (!Number.isInteger(priority) || priority < PRIORITY_MIN || priority > PRIORITY_MAX) {
    return [
      {
        field: 'priority',
        message: `Priority must be an integer from ${PRIORITY_MIN} to ${PRIORITY_MAX}`,
      },
    ];
  }
  return [];
}

function reminderIssues(reminder: TaskReminder | null, context: DetailsContext): ValidationIssue[] {
  if (reminder === null) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  if (!isValidTimeZone(reminder.timeZone)) {
    issues.push({
      field: 'reminder',
      message: 'Reminder time zone must be a valid IANA time zone',
    });
  }
  if (reminder.type === 'exact' && !isValidLocalDateTime(reminder.localDateTime)) {
    issues.push({
      field: 'reminder',
      message: 'Exact reminder must use a valid YYYY-MM-DD date and HH:mm time',
    });
  }
  if (reminder.type === 'exact' && context.isFuture) {
    issues.push({
      field: 'reminder',
      message: 'A reminder with a date cannot be set for a Future task',
    });
  }
  if (reminder.type === 'dayPeriod' && !isDayPeriod(reminder.period)) {
    issues.push({
      field: 'reminder',
      message: `Reminder period must be one of ${DAY_PERIODS.join(', ')}`,
    });
  }
  return issues;
}

export function validateRankedSlot(slot: RankedSlotInput): Result<RankedSlot, TaskValidationError> {
  const issues: ValidationIssue[] = [];
  if (!isValidLocalDate(slot.scheduledDate)) {
    issues.push({ field: 'scheduledDate', message: 'Date must be a valid YYYY-MM-DD date' });
  }
  issues.push(...priorityIssues(slot.priority));
  if (issues.length > 0 || slot.priority === null) {
    return err(validationError(issues));
  }
  return ok({ scheduledDate: slot.scheduledDate, priority: slot.priority });
}

export function validateDetails(
  details: TaskDetails,
  context: DetailsContext = SCHEDULED,
): Result<TaskDetails, TaskValidationError> {
  const issues: ValidationIssue[] = [];
  const title = details.title.trim();

  if (title.length === 0) {
    issues.push({ field: 'title', message: 'Title is required' });
  }
  if (details.exactTime !== null && !isValidLocalTime(details.exactTime)) {
    issues.push({ field: 'exactTime', message: 'Exact time must use HH:mm format' });
  }
  if (details.dayPeriod !== null && !isDayPeriod(details.dayPeriod)) {
    issues.push({
      field: 'dayPeriod',
      message: `Day period must be one of ${DAY_PERIODS.join(', ')}`,
    });
  }
  if (details.exactTime !== null && details.dayPeriod !== null) {
    issues.push({
      field: 'exactTime',
      message: 'Exact time and day period cannot be set at the same time',
    });
  }
  if (details.durationMinutes !== null && !isPositiveInteger(details.durationMinutes)) {
    issues.push({ field: 'durationMinutes', message: 'Duration must be a positive integer' });
  }
  if (details.travelMinutes !== null && !isNonNegativeInteger(details.travelMinutes)) {
    issues.push({ field: 'travelMinutes', message: 'Travel time must be a non-negative integer' });
  }
  issues.push(...reminderIssues(details.reminder, context));

  if (issues.length > 0) {
    return err(validationError(issues));
  }

  return ok({
    ...details,
    title,
    description: normalizeOptionalText(details.description),
    address: normalizeOptionalText(details.address),
    thingsToTake: details.thingsToTake
      .map((item) => ({ text: item.text.trim(), checked: item.checked }))
      .filter((item) => item.text.length > 0),
  });
}
