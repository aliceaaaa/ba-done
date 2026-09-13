import {
  isValidLocalDate,
  isValidLocalDateTime,
  isValidTimeZone,
  zonedDateTimeToInstant,
} from '@/shared/lib/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import {
  EVENT_MESSAGES,
  eventValidationError,
  type EventValidationError,
  type EventValidationIssue,
} from './event-errors';
import type { EventTimingInput } from './types';

export type ResolvedTiming =
  | { allDay: false; startAt: string; endAt: string; startDate: null; endDate: null }
  | { allDay: true; startAt: null; endAt: null; startDate: string; endDate: string };

export function resolveTiming(
  timing: EventTimingInput,
  timeZone: string,
): Result<ResolvedTiming, EventValidationIssue[]> {
  const issues: EventValidationIssue[] = [];
  if (timing.allDay) {
    if (!isValidLocalDate(timing.startDate)) {
      issues.push({ field: 'start', message: EVENT_MESSAGES.invalidStart });
    }
    if (!isValidLocalDate(timing.endDate)) {
      issues.push({ field: 'end', message: EVENT_MESSAGES.invalidEnd });
    }
    if (issues.length === 0 && timing.endDate < timing.startDate) {
      issues.push({ field: 'end', message: EVENT_MESSAGES.endDateBeforeStartDate });
    }
    return issues.length > 0
      ? err(issues)
      : ok({
          allDay: true,
          startAt: null,
          endAt: null,
          startDate: timing.startDate,
          endDate: timing.endDate,
        });
  }
  const validStart = isValidLocalDateTime(timing.start) && isValidTimeZone(timeZone);
  const validEnd = isValidLocalDateTime(timing.end) && isValidTimeZone(timeZone);
  if (!validStart) {
    issues.push({ field: 'start', message: EVENT_MESSAGES.invalidStart });
  }
  if (!validEnd) {
    issues.push({ field: 'end', message: EVENT_MESSAGES.invalidEnd });
  }
  if (!validStart || !validEnd) {
    return err(issues);
  }
  const startAt = zonedDateTimeToInstant(timing.start, timeZone);
  const endAt = zonedDateTimeToInstant(timing.end, timeZone);
  if (endAt.getTime() <= startAt.getTime()) {
    return err([{ field: 'end', message: EVENT_MESSAGES.endBeforeStart }]);
  }
  return ok({
    allDay: false,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    startDate: null,
    endDate: null,
  });
}

export function validateTitle(title: string): EventValidationIssue[] {
  return title.trim().length === 0
    ? [{ field: 'title', message: EVENT_MESSAGES.titleRequired }]
    : [];
}

export function validateTravelMinutes(value: number | null): EventValidationIssue[] {
  return value === null || (Number.isInteger(value) && value >= 0)
    ? []
    : [{ field: 'travelMinutes', message: EVENT_MESSAGES.travelMinutes }];
}

export function validateReminder(
  localDateTime: string,
  timeZone: string,
  now: Date,
): EventValidationIssue[] {
  if (!isValidLocalDateTime(localDateTime) || !isValidTimeZone(timeZone)) {
    return [{ field: 'reminder', message: EVENT_MESSAGES.invalidReminder }];
  }
  return zonedDateTimeToInstant(localDateTime, timeZone).getTime() <= now.getTime()
    ? [{ field: 'reminder', message: EVENT_MESSAGES.reminderInPast }]
    : [];
}

export function toValidationResult<T>(
  issues: EventValidationIssue[],
  value: () => T,
): Result<T, EventValidationError> {
  return issues.length > 0 ? err(eventValidationError(issues)) : ok(value());
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
