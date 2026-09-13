import type { SqlDatabase } from '@/database/sql-database';
import type { ThingToTakeInput } from '@/entities/task';
import { addDays, startOfLocalDay } from '@/shared/lib/local-date';
import { err, ok, type Result } from '@/shared/lib/result';

import {
  createCalendarEventRepository,
  type CalendarEventRepository,
} from '../api/calendar-event-repository';
import {
  eventNotFound,
  eventValidationError,
  type EventError,
  type EventValidationIssue,
} from './event-errors';
import {
  normalizeOptionalText,
  resolveTiming,
  validateReminder,
  validateTitle,
  validateTravelMinutes,
  type ResolvedTiming,
} from './event-validation';
import type {
  CalendarEvent,
  CreateEventInput,
  EventReminder,
  EventReminderInput,
  UpdateEventInput,
} from './types';

export type CalendarEventServiceDeps = {
  db: SqlDatabase;
  now: () => Date;
  generateId: () => string;
  timeZone: () => string;
};

export type EventResult<T> = Result<T, EventError>;

export type CalendarEventService = {
  getNow(): Date;
  getTimeZone(): string;
  getEvent(id: string): Promise<EventResult<CalendarEvent>>;
  listEventsInRange(fromDate: string, toDate: string): Promise<CalendarEvent[]>;
  getEventsWithReminders(): Promise<CalendarEvent[]>;
  createEvent(input: CreateEventInput): Promise<EventResult<CalendarEvent>>;
  updateEvent(id: string, input: UpdateEventInput): Promise<EventResult<CalendarEvent>>;
  deleteEvent(id: string): Promise<EventResult<{ id: string }>>;
  setThingToTakeChecked(
    id: string,
    index: number,
    checked: boolean,
  ): Promise<EventResult<CalendarEvent>>;
  snoozeReminder(id: string, localDateTime: string): Promise<EventResult<CalendarEvent>>;
  onChange(listener: () => void): () => void;
};

function normalizeThings(items: readonly ThingToTakeInput[]) {
  return items
    .map((item) => ({ text: item.text.trim(), checked: item.checked ?? false }))
    .filter((item) => item.text.length > 0);
}

export function createCalendarEventService({
  db,
  now,
  generateId,
  timeZone,
}: CalendarEventServiceDeps): CalendarEventService {
  const listeners = new Set<() => void>();

  function notifyChanged() {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  async function write(work: (repo: CalendarEventRepository) => Promise<void>): Promise<void> {
    await db.transaction((tx) => work(createCalendarEventRepository(tx)));
    notifyChanged();
  }

  function resolveReminder(
    input: EventReminderInput | null,
    zone: string,
    instant: Date,
    issues: EventValidationIssue[],
  ): EventReminder | null {
    if (input === null) {
      return null;
    }
    issues.push(...validateReminder(input.localDateTime, zone, instant));
    return { type: 'exact', localDateTime: input.localDateTime, timeZone: zone };
  }

  const service: CalendarEventService = {
    getNow() {
      return now();
    },

    getTimeZone() {
      return timeZone();
    },

    async getEvent(id) {
      const event = await createCalendarEventRepository(db).findById(id);
      return event === null ? err(eventNotFound(id)) : ok(event);
    },

    listEventsInRange(fromDate, toDate) {
      const zone = timeZone();
      return createCalendarEventRepository(db).listOverlapping({
        fromDate,
        toDate,
        fromInstant: startOfLocalDay(fromDate, zone).toISOString(),
        toInstant: startOfLocalDay(addDays(toDate, 1), zone).toISOString(),
      });
    },

    getEventsWithReminders() {
      return createCalendarEventRepository(db).listWithReminders();
    },

    async createEvent(input) {
      const zone = timeZone();
      const instant = now();
      const issues: EventValidationIssue[] = [...validateTitle(input.title)];
      const timing = resolveTiming(input.timing, zone);
      if (!timing.ok) {
        issues.push(...timing.error);
      }
      const travelMinutes = input.travelMinutes ?? null;
      issues.push(...validateTravelMinutes(travelMinutes));
      const reminder = resolveReminder(input.reminder ?? null, zone, instant, issues);
      if (issues.length > 0 || !timing.ok) {
        return err(eventValidationError(issues));
      }
      const createdAt = instant.toISOString();
      const event: CalendarEvent = {
        ...timing.value,
        id: generateId(),
        title: input.title.trim(),
        timeZone: zone,
        description: normalizeOptionalText(input.description),
        address: normalizeOptionalText(input.address),
        travelMinutes,
        thingsToTake: normalizeThings(input.thingsToTake ?? []),
        reminder,
        source: 'internal',
        externalCalendarId: null,
        externalEventId: null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      };
      await write((repo) => repo.insert(event));
      return ok(event);
    },

    async updateEvent(id, input) {
      const repo = createCalendarEventRepository(db);
      const current = await repo.findById(id);
      if (current === null) {
        return err(eventNotFound(id));
      }
      const zone = input.timing === undefined ? current.timeZone : timeZone();
      const instant = now();
      const issues: EventValidationIssue[] = [];
      const title = input.title ?? current.title;
      issues.push(...validateTitle(title));
      let timing: ResolvedTiming = current.allDay
        ? {
            allDay: true,
            startAt: null,
            endAt: null,
            startDate: current.startDate,
            endDate: current.endDate,
          }
        : {
            allDay: false,
            startAt: current.startAt,
            endAt: current.endAt,
            startDate: null,
            endDate: null,
          };
      if (input.timing !== undefined) {
        const resolved = resolveTiming(input.timing, zone);
        if (resolved.ok) {
          timing = resolved.value;
        } else {
          issues.push(...resolved.error);
        }
      }
      const travelMinutes =
        input.travelMinutes === undefined ? current.travelMinutes : input.travelMinutes;
      issues.push(...validateTravelMinutes(travelMinutes));
      const reminder =
        input.reminder === undefined
          ? current.reminder
          : resolveReminder(input.reminder, timeZone(), instant, issues);
      if (issues.length > 0) {
        return err(eventValidationError(issues));
      }
      const updated: CalendarEvent = {
        ...current,
        ...timing,
        title: title.trim(),
        timeZone: zone,
        description:
          input.description === undefined
            ? current.description
            : normalizeOptionalText(input.description),
        address:
          input.address === undefined ? current.address : normalizeOptionalText(input.address),
        travelMinutes,
        thingsToTake:
          input.thingsToTake === undefined
            ? current.thingsToTake
            : normalizeThings(input.thingsToTake),
        reminder,
        updatedAt: instant.toISOString(),
      };
      await write((tx) => tx.update(updated));
      return ok(updated);
    },

    async deleteEvent(id) {
      const repo = createCalendarEventRepository(db);
      if ((await repo.findById(id)) === null) {
        return err(eventNotFound(id));
      }
      await write((tx) => tx.softDelete(id, now().toISOString()));
      return ok({ id });
    },

    async setThingToTakeChecked(id, index, checked) {
      const current = await createCalendarEventRepository(db).findById(id);
      if (current === null) {
        return err(eventNotFound(id));
      }
      if (current.thingsToTake[index] === undefined) {
        return err(eventValidationError([{ field: 'thingsToTake', message: 'Item not found' }]));
      }
      const updated: CalendarEvent = {
        ...current,
        thingsToTake: current.thingsToTake.map((item, position) =>
          position === index ? { ...item, checked } : item,
        ),
        updatedAt: now().toISOString(),
      };
      await write((tx) => tx.update(updated));
      return ok(updated);
    },

    async snoozeReminder(id, localDateTime) {
      return service.updateEvent(id, { reminder: { localDateTime } });
    },

    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return service;
}
