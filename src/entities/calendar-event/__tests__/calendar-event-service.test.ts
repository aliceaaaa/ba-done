import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import {
  TEST_TIME_ZONE,
  TODAY,
  TOMORROW,
  createTestDatabase,
  createTestEventService,
  unwrap,
} from '@/test-utils/test-app';

import { eventLocalDates, eventLocalTiming, eventOccursOn, eventStatus } from '../lib/event-time';
import { formatEventTimesForDay } from '../lib/event-format';
import type { CalendarEventService, EventResult } from '../model/calendar-event-service';
import type { EventError } from '../model/event-errors';
import type { CreateEventInput } from '../model/types';

function unwrapError<T>(result: EventResult<T>): EventError {
  if (result.ok) {
    throw new Error('Expected a failure result');
  }
  return result.error;
}

describe('CalendarEventService', () => {
  let db: NodeSqliteDatabase;
  let service: CalendarEventService;

  function createTimed(overrides: Partial<CreateEventInput> = {}) {
    return service.createEvent({
      title: 'Lunch',
      timing: { allDay: false, start: `${TODAY}T12:30`, end: `${TODAY}T13:30` },
      ...overrides,
    });
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    service = createTestEventService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a timed event with absolute instants and the device time zone', async () => {
    const event = unwrap(
      await createTimed({
        title: '  Lunch with Sam ',
        description: ' Near the office ',
        address: 'Market Square 3',
        travelMinutes: 15,
        thingsToTake: [{ text: 'Umbrella' }, { text: '  ' }],
      }),
    );

    expect(event).toMatchObject({
      id: 'event-1',
      title: 'Lunch with Sam',
      allDay: false,
      startAt: '2026-09-11T10:30:00.000Z',
      endAt: '2026-09-11T11:30:00.000Z',
      startDate: null,
      endDate: null,
      timeZone: TEST_TIME_ZONE,
      description: 'Near the office',
      address: 'Market Square 3',
      travelMinutes: 15,
      thingsToTake: [{ text: 'Umbrella', checked: false }],
      reminder: null,
      source: 'internal',
      externalCalendarId: null,
      externalEventId: null,
      deletedAt: null,
    });
    expect(unwrap(await service.getEvent(event.id))).toEqual(event);
  });

  it('creates an all-day event stored as calendar dates', async () => {
    const event = unwrap(
      await service.createEvent({
        title: 'Conference',
        timing: { allDay: true, startDate: TODAY, endDate: TODAY },
      }),
    );

    expect(event).toMatchObject({
      allDay: true,
      startDate: TODAY,
      endDate: TODAY,
      startAt: null,
      endAt: null,
    });
    const row = await db.get<{ start_at: string | null; start_date: string }>(
      'SELECT start_at, start_date FROM calendar_events WHERE id = ?',
      [event.id],
    );
    expect(row).toEqual({ start_at: null, start_date: TODAY });
  });

  it('supports events that span several days', async () => {
    const trip = unwrap(
      await service.createEvent({
        title: 'Trip',
        timing: { allDay: true, startDate: TODAY, endDate: '2026-09-13' },
      }),
    );
    const night = unwrap(
      await createTimed({
        title: 'Night train',
        timing: { allDay: false, start: `${TODAY}T22:00`, end: `${TOMORROW}T06:00` },
      }),
    );

    expect(eventLocalDates(trip, TEST_TIME_ZONE)).toEqual([TODAY, TOMORROW, '2026-09-13']);
    expect(eventLocalDates(night, TEST_TIME_ZONE)).toEqual([TODAY, TOMORROW]);
    expect((await service.listEventsInRange(TOMORROW, TOMORROW)).map((e) => e.title)).toEqual([
      'Trip',
      'Night train',
    ]);
    expect(await service.listEventsInRange('2026-09-14', '2026-09-14')).toEqual([]);
  });

  it('rejects a timed event whose start is not before its end', async () => {
    const same = unwrapError(
      await createTimed({
        timing: { allDay: false, start: `${TODAY}T12:00`, end: `${TODAY}T12:00` },
      }),
    );
    const reversed = unwrapError(
      await createTimed({
        timing: { allDay: false, start: `${TODAY}T12:00`, end: `${TODAY}T11:00` },
      }),
    );
    const allDay = unwrapError(
      await service.createEvent({
        title: 'Backwards',
        timing: { allDay: true, startDate: TOMORROW, endDate: TODAY },
      }),
    );

    expect(same).toMatchObject({
      type: 'ValidationError',
      issues: [{ field: 'end', message: 'End must be after start' }],
    });
    expect(reversed).toMatchObject({ issues: [{ field: 'end' }] });
    expect(allDay).toMatchObject({
      issues: [{ field: 'end', message: 'End date cannot be before the start date' }],
    });
    expect(await service.listEventsInRange(TODAY, TOMORROW)).toEqual([]);
  });

  it('reports title, travel time and reminder problems together', async () => {
    const error = unwrapError(
      await createTimed({
        title: ' ',
        travelMinutes: -5,
        reminder: { localDateTime: `${TODAY}T09:00` },
      }),
    );

    expect(error).toMatchObject({
      issues: [
        { field: 'title', message: 'Title is required' },
        { field: 'travelMinutes' },
        { field: 'reminder', message: 'Choose a reminder time in the future' },
      ],
    });
  });

  it('edits an event and keeps unchanged fields', async () => {
    const event = unwrap(await createTimed({ address: 'Old street' }));

    const edited = unwrap(
      await service.updateEvent(event.id, {
        title: 'Long lunch',
        timing: { allDay: false, start: `${TODAY}T12:30`, end: `${TODAY}T15:00` },
      }),
    );

    expect(edited).toMatchObject({
      id: event.id,
      title: 'Long lunch',
      endAt: '2026-09-11T13:00:00.000Z',
      address: 'Old street',
      createdAt: event.createdAt,
    });
    expect(unwrap(await service.getEvent(event.id))).toEqual(edited);
  });

  it('switches between timed and all-day without keeping hidden values', async () => {
    const event = unwrap(await createTimed());

    const allDay = unwrap(
      await service.updateEvent(event.id, {
        timing: { allDay: true, startDate: TODAY, endDate: TODAY },
      }),
    );
    const timed = unwrap(
      await service.updateEvent(event.id, {
        timing: { allDay: false, start: `${TODAY}T18:00`, end: `${TODAY}T19:00` },
      }),
    );

    expect(allDay).toMatchObject({ allDay: true, startAt: null, endAt: null, startDate: TODAY });
    expect(timed).toMatchObject({
      allDay: false,
      startDate: null,
      endDate: null,
      startAt: '2026-09-11T16:00:00.000Z',
    });
  });

  it('soft deletes an event', async () => {
    const event = unwrap(await createTimed());

    unwrap(await service.deleteEvent(event.id));

    expect(unwrapError(await service.getEvent(event.id))).toMatchObject({ type: 'EventNotFound' });
    expect(await service.listEventsInRange(TODAY, TODAY)).toEqual([]);
    expect(
      await db.get<{ deleted_at: string | null }>(
        'SELECT deleted_at FROM calendar_events WHERE id = ?',
        [event.id],
      ),
    ).toEqual({ deleted_at: expect.any(String) });
    expect(unwrapError(await service.deleteEvent(event.id))).toMatchObject({
      type: 'EventNotFound',
    });
  });

  it('keeps the intended wall-clock times across a daylight saving change', async () => {
    const event = unwrap(
      await createTimed({
        title: 'Overnight shift',
        timing: { allDay: false, start: '2026-10-24T22:00', end: '2026-10-25T09:00' },
      }),
    );

    expect(event).toMatchObject({
      startAt: '2026-10-24T20:00:00.000Z',
      endAt: '2026-10-25T08:00:00.000Z',
    });
    expect(eventLocalTiming(event, TEST_TIME_ZONE)).toEqual({
      allDay: false,
      startDate: '2026-10-24',
      startTime: '22:00',
      endDate: '2026-10-25',
      endTime: '09:00',
    });
  });

  it('shows timed events in the device time zone but never shifts all-day events', async () => {
    const timed = unwrap(await createTimed());
    const allDay = unwrap(
      await service.createEvent({
        title: 'Holiday',
        timing: { allDay: true, startDate: TOMORROW, endDate: TOMORROW },
      }),
    );
    const auckland = createTestEventService(db, { timeZone: 'Pacific/Auckland' });

    expect(eventLocalTiming(timed, 'Pacific/Auckland')).toMatchObject({
      startDate: TODAY,
      startTime: '22:30',
    });
    expect(eventOccursOn(allDay, TOMORROW, 'Pacific/Auckland')).toBe(true);
    expect(eventOccursOn(allDay, TODAY, 'Pacific/Auckland')).toBe(false);
    expect((await auckland.listEventsInRange(TOMORROW, TOMORROW)).map((e) => e.title)).toEqual([
      'Holiday',
    ]);
    expect(
      (
        await createTestEventService(db, { timeZone: 'America/Los_Angeles' }).listEventsInRange(
          TOMORROW,
          TOMORROW,
        )
      ).map((e) => e.title),
    ).toEqual(['Holiday']);
  });

  it('describes a midnight-crossing event from the point of view of each day', async () => {
    const event = unwrap(
      await createTimed({
        title: 'Late show',
        timing: { allDay: false, start: `${TODAY}T23:00`, end: `${TOMORROW}T01:00` },
      }),
    );

    expect(eventOccursOn(event, TODAY, TEST_TIME_ZONE)).toBe(true);
    expect(eventOccursOn(event, TOMORROW, TEST_TIME_ZONE)).toBe(true);
    expect(formatEventTimesForDay(event, TODAY, TEST_TIME_ZONE)).toMatch(/next day$/);
    expect(formatEventTimesForDay(event, TOMORROW, TEST_TIME_ZONE)).toMatch(/^Until /);
  });

  it('knows whether an event is upcoming, happening now or ended', async () => {
    const event = unwrap(await createTimed());

    expect(eventStatus(event, new Date('2026-09-11T10:00:00.000Z'), TEST_TIME_ZONE)).toBe(
      'upcoming',
    );
    expect(eventStatus(event, new Date('2026-09-11T11:00:00.000Z'), TEST_TIME_ZONE)).toBe('now');
    expect(eventStatus(event, new Date('2026-09-11T11:30:00.000Z'), TEST_TIME_ZONE)).toBe('ended');
  });

  it('checks things to take, snoozes the reminder and notifies listeners', async () => {
    const listener = jest.fn();
    service.onChange(listener);
    const event = unwrap(
      await createTimed({
        thingsToTake: [{ text: 'Wallet' }],
        reminder: { localDateTime: `${TODAY}T12:00` },
      }),
    );

    const checked = unwrap(await service.setThingToTakeChecked(event.id, 0, true));
    const snoozed = unwrap(await service.snoozeReminder(event.id, `${TODAY}T12:15`));

    expect(checked.thingsToTake).toEqual([{ text: 'Wallet', checked: true }]);
    expect(snoozed).toMatchObject({
      startAt: event.startAt,
      endAt: event.endAt,
      reminder: { type: 'exact', localDateTime: `${TODAY}T12:15`, timeZone: TEST_TIME_ZONE },
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
