import type { SqlDatabase } from '@/database/sql-database';
import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import type { CalendarEventService } from '@/entities/calendar-event';
import type { ListService } from '@/entities/list';
import type { TaskService } from '@/entities/task';
import {
  TEST_TIME_ZONE,
  TODAY,
  TOMORROW,
  createTestClock,
  createTestDatabase,
  createTestEventService,
  createTestListService,
  createTestService,
  unwrap,
} from '@/test-utils/test-app';

import {
  VOICE_EXECUTION_MESSAGES,
  createVoiceCommandExecutor,
  type VoiceCommandExecutor,
} from '../model/voice-command-executor';
import type { VoiceCommandHint } from '../model/voice-command';
import {
  createVoiceCommandSession,
  type VoiceCommandSession,
} from '../model/voice-command-session';

function brokenDatabase(db: SqlDatabase): SqlDatabase {
  return {
    ...db,
    transaction() {
      return Promise.reject(new Error('SQLITE_FULL: database or disk is full'));
    },
  };
}

describe('Voice command execution', () => {
  let db: NodeSqliteDatabase;
  let tasks: TaskService;
  let events: CalendarEventService;
  let lists: ListService;
  let executor: VoiceCommandExecutor;
  let session: VoiceCommandSession;
  let sessionId: number;

  function createSession(services: {
    tasks: TaskService;
    events: CalendarEventService;
    lists: ListService;
  }) {
    executor = createVoiceCommandExecutor(services);
    const now = createTestClock();
    return createVoiceCommandSession({
      executor,
      loadLists: async () =>
        (await lists.getLists()).map((list) => ({
          id: list.id,
          title: list.title,
          kind: list.kind,
        })),
      now,
      timeZone: () => TEST_TIME_ZONE,
      preferredLanguage: () => 'en',
    });
  }

  function say(transcript: string, hint: VoiceCommandHint = { kind: 'none' }, id?: number) {
    sessionId += 1;
    return session.handleTranscript({
      sessionId: id ?? sessionId,
      transcript,
      confidence: 0.9,
      mode: 'manual',
      hint,
    });
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    tasks = createTestService(db);
    events = createTestEventService(db);
    lists = createTestListService(db);
    session = createSession({ tasks, events, lists });
    sessionId = 0;
  });

  afterEach(() => {
    db.close();
  });

  async function shoppingItems() {
    const [shopping] = await lists.getLists();
    return unwrap(await lists.getItems(shopping?.id ?? '')).active;
  }

  it('saves an unambiguous list item immediately and confirms it', async () => {
    expect(await say('Hey app, add milk to Shopping')).toBe('executed');

    expect((await shoppingItems()).map((item) => item.title)).toEqual(['Milk']);
    expect(session.getState()).toMatchObject({
      pending: null,
      notice: { message: 'Added to Shopping: Milk', undo: { kind: 'listItem' } },
    });
  });

  it('does not silently create an unknown list', async () => {
    expect(await say('Add three bottles of water to Groceries')).toBe('preview');

    expect((await lists.getLists()).map((list) => list.title)).toEqual(['Shopping']);
    expect(session.getState().pending?.draft.ambiguities).toEqual([
      { type: 'listNotFound', listName: 'Groceries' },
    ]);
    expect(await db.all('SELECT id FROM list_items')).toEqual([]);
  });

  it('creates the named list together with the item only after confirmation', async () => {
    const result = await executor.execute('voice-new-list', {
      kind: 'newListItem',
      listTitle: 'Groceries',
      title: 'Water',
      quantity: 3,
      unit: 'bottles',
    });

    expect(result).toMatchObject({ ok: true, message: 'Created Groceries and added Water' });
    expect((await lists.getLists()).map((list) => list.title)).toEqual(['Shopping', 'Groceries']);
  });

  it('creates a Future task without a priority', async () => {
    expect(await say('Добавь задачу забрать куртку')).toBe('executed');

    const [task] = await tasks.getFuturePool();
    expect(task).toMatchObject({
      title: 'Забрать куртку',
      scheduledDate: null,
      priority: null,
      placementType: null,
    });
    expect(session.getState().notice?.message).toBe('Added to Future: Забрать куртку');
  });

  it('requires a priority for a ranked task', async () => {
    expect(await say('Remind me tomorrow at 9 to send the report')).toBe('preview');

    const pending = session.getState().pending;
    expect(pending?.draft.missingFields).toEqual(['priority']);
    expect(await tasks.getDeck(TOMORROW)).toEqual([]);

    const attempt = await executor.execute(pending?.commandId ?? '', {
      kind: 'rankedTask',
      title: 'Send the report',
      date: TOMORROW,
      priority: null,
      exactTime: null,
      dayPeriod: null,
      reminder: null,
    });
    expect(attempt).toMatchObject({
      ok: false,
      reason: 'invalid',
      fields: { priority: 'Choose a priority from 1 to 10' },
    });
  });

  it('shows the occupied priority and the free positions on a conflict', async () => {
    const busy = unwrap(
      await tasks.createTask({ title: 'Busy', scheduledDate: TOMORROW, priority: 7 }),
    );
    unwrap(await tasks.createTask({ title: 'Other', scheduledDate: TOMORROW, priority: 3 }));

    const result = await executor.execute('voice-conflict', {
      kind: 'rankedTask',
      title: 'Call mom',
      date: TOMORROW,
      priority: 7,
      exactTime: null,
      dayPeriod: null,
      reminder: null,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'priorityConflict',
      conflict: {
        date: TOMORROW,
        priority: 7,
        occupiedBy: { id: busy.id, title: 'Busy' },
        freePriorities: [10, 9, 8, 6, 5, 4, 2, 1],
      },
    });
    expect((await tasks.getDeck(TOMORROW)).map((task) => task.title)).toEqual(['Busy', 'Other']);
  });

  it('saves a ranked task through TaskService', async () => {
    await say('Add call John tomorrow with priority four');
    const pending = session.getState().pending;

    const result = await executor.execute(pending?.commandId ?? '', {
      kind: 'rankedTask',
      title: pending?.draft.title ?? '',
      date: pending?.draft.date ?? null,
      priority: pending?.draft.priority ?? null,
      exactTime: null,
      dayPeriod: null,
      reminder: null,
    });

    expect(result).toMatchObject({ ok: true, destination: { screen: 'matches', date: TOMORROW } });
    expect(await tasks.getDeck(TOMORROW)).toEqual([
      expect.objectContaining({ title: 'Call John', placementType: 'ranked', priority: 4 }),
    ]);
  });

  it('saves an event through CalendarEventService', async () => {
    await say('Встреча с Анной завтра в 15:00 на час');
    const draft = session.getState().pending?.draft;

    const result = await executor.execute('voice-event', {
      kind: 'calendarEvent',
      title: draft?.title ?? '',
      allDay: false,
      start: draft?.eventStart ?? null,
      end: draft?.eventEnd ?? null,
      reminder: null,
    });

    expect(result).toMatchObject({ ok: true, destination: { screen: 'calendar', date: TOMORROW } });
    expect(await events.listEventsInRange(TOMORROW, TOMORROW)).toEqual([
      expect.objectContaining({
        title: 'Встреча с Анной',
        startAt: '2026-09-12T13:00:00.000Z',
        endAt: '2026-09-12T14:00:00.000Z',
      }),
    ]);
  });

  it('rejects a reminder in the past with the domain error', async () => {
    await say('Напомни сегодня в 6:00 купить билеты, приоритет 2');
    const pending = session.getState().pending;
    expect(pending?.draft.reminder).toEqual({ type: 'exact', localDateTime: `${TODAY}T06:00` });

    const result = await executor.execute(pending?.commandId ?? '', {
      kind: 'rankedTask',
      title: 'Купить билеты',
      date: TODAY,
      priority: 2,
      exactTime: null,
      dayPeriod: null,
      reminder: pending?.draft.reminder ?? null,
    });

    expect(result).toMatchObject({
      ok: false,
      fields: { reminder: 'Choose a reminder time in the future' },
    });
    expect(await tasks.getDeck(TODAY)).toEqual([]);
  });

  it('opens the preview for a dated command that may be a task or an event', async () => {
    expect(await say('Стоматолог завтра в 12')).toBe('preview');

    expect(session.getState().pending?.draft.ambiguities).toContainEqual({ type: 'taskOrEvent' });
    expect(await tasks.getDeck(TOMORROW)).toEqual([]);
    expect(await events.listEventsInRange(TOMORROW, TOMORROW)).toEqual([]);
  });

  it('suggests an event end but never saves the event automatically', async () => {
    expect(
      await say('Create an event dentist tomorrow at 9 am', { kind: 'calendar', date: TODAY }),
    ).toBe('preview');

    expect(session.getState().pending?.draft).toMatchObject({
      eventEnd: `${TOMORROW}T10:00`,
      ambiguities: [{ type: 'eventEndSuggested', suggestedEnd: `${TOMORROW}T10:00` }],
    });
    expect(await events.listEventsInRange(TOMORROW, TOMORROW)).toEqual([]);
  });

  it('undoes a created list item', async () => {
    await say('add bread to Shopping');
    expect(await shoppingItems()).toHaveLength(1);

    expect(await session.undoNotice()).toBe(true);

    expect(await shoppingItems()).toEqual([]);
    expect(session.getState().notice).toBeNull();
  });

  it('undoes a created Future task', async () => {
    await say('Someday learn the guitar');
    expect(await tasks.getFuturePool()).toHaveLength(1);

    expect(await session.undoNotice()).toBe(true);

    expect(await tasks.getFuturePool()).toEqual([]);
  });

  it('does not show a false confirmation when SQLite fails', async () => {
    await lists.getLists();
    const broken = brokenDatabase(db);
    session = createSession({
      tasks: createTestService(broken),
      events: createTestEventService(broken),
      lists: createTestListService(broken),
    });

    expect(await say('add milk to Shopping')).toBe('preview');

    expect(session.getState().notice).toBeNull();
    expect(session.getState().pending?.error).toBe(VOICE_EXECUTION_MESSAGES.storage);
    expect(await db.all('SELECT id FROM list_items')).toEqual([]);
  });

  it('does not create two entities from a duplicated recognition callback', async () => {
    const first = say('add milk to Shopping', { kind: 'none' }, 42);
    const second = say('add milk to Shopping', { kind: 'none' }, 42);

    expect(await Promise.all([first, second])).toEqual(['executed', 'duplicate']);
    expect(await shoppingItems()).toHaveLength(1);

    const input = {
      kind: 'futureTask',
      title: 'Once',
      exactTime: null,
      dayPeriod: null,
      reminder: null,
    } as const;
    const [a, b] = await Promise.all([
      executor.execute('same-command', input),
      executor.execute('same-command', input),
    ]);
    expect(a).toBe(b);
    expect(await tasks.getFuturePool()).toHaveLength(1);
  });

  it('clears the open draft and its transcript when voice history is deleted', async () => {
    await say('Add three bottles of water to Groceries');
    expect(session.hasHistory()).toBe(true);

    session.clearHistory();

    expect(session.getState()).toEqual({ pending: null, notice: null });
    expect(session.hasHistory()).toBe(false);
  });
});
