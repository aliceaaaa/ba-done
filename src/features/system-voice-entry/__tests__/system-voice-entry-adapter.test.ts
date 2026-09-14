import type { SqlDatabase } from '@/database/sql-database';
import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import type { CalendarEventService } from '@/entities/calendar-event';
import type { ListService } from '@/entities/list';
import type { TaskService } from '@/entities/task';
import {
  TEST_START,
  TODAY,
  TOMORROW,
  YESTERDAY,
  createTestDatabase,
  createTestEventService,
  createTestListService,
  createTestService,
  createTestSystemVoiceEntry,
  createTestVoice,
  unwrap,
  type TestSystemVoiceEntry,
  type TestVoice,
} from '@/test-utils/test-app';

import { SYSTEM_VOICE_TEXT } from '../model/system-voice-entry-adapter';
import { createVoiceEntryInbox } from '../model/voice-entry-inbox';
import { createFakeNativeVoiceEntryBridge } from '../testing/fake-native-voice-entry-bridge';

let counter = 0;

function intent(action: string, fields: Record<string, unknown> = {}) {
  counter += 1;
  return {
    version: '1',
    intentId: `intent-${String(counter).padStart(4, '0')}`,
    action,
    locale: 'en-US',
    createdAt: TEST_START,
    ...fields,
  };
}

function failingDatabase(db: SqlDatabase, table: string): SqlDatabase {
  return {
    ...db,
    transaction(work) {
      return db.transaction((tx) =>
        work({
          ...tx,
          async run(sql, params) {
            if (sql.includes(table)) {
              throw new Error('SQLITE_FULL: database or disk is full');
            }
            return tx.run(sql, params);
          },
        }),
      );
    },
  };
}

describe('SystemVoiceEntryAdapter', () => {
  let db: NodeSqliteDatabase;
  let tasks: TaskService;
  let events: CalendarEventService;
  let lists: ListService;
  let voice: TestVoice;
  let entry: TestSystemVoiceEntry;

  function setup(services: {
    tasks: TaskService;
    events: CalendarEventService;
    lists: ListService;
  }) {
    voice = createTestVoice(db, services);
    entry = createTestSystemVoiceEntry(db, { voice, lists: services.lists });
  }

  function receive(payload: unknown, source: 'iosAppIntent' | 'deepLink' = 'iosAppIntent') {
    return entry.services.adapter.receive(payload, source);
  }

  async function shoppingItems() {
    const [shopping] = await lists.getLists();
    return unwrap(await lists.getItems(shopping?.id ?? '')).active;
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    tasks = createTestService(db);
    events = createTestEventService(db);
    lists = createTestListService(db);
    setup({ tasks, events, lists });
  });

  afterEach(() => {
    voice.services.dispose();
    db.close();
  });

  describe('list items', () => {
    it('saves an item to the only shopping list and offers an idempotent Undo', async () => {
      const outcome = await receive(intent('addListItem', { text: 'Milk' }));

      expect(outcome).toMatchObject({ kind: 'saved', message: 'Saved to Shopping' });
      expect((await shoppingItems()).map((item) => item.title)).toEqual(['Milk']);
      expect(voice.services.session.getState().notice).toMatchObject({
        message: 'Saved to Shopping',
      });

      const intentId = outcome.kind === 'saved' ? outcome.intentId : '';
      expect(await entry.services.adapter.undo(intentId)).toBe(true);
      expect(await entry.services.adapter.undo(intentId)).toBe(true);
      expect(await shoppingItems()).toEqual([]);
      expect(
        await db.get('SELECT status, undone_at IS NOT NULL AS undone FROM voice_entry_intents'),
      ).toEqual({ status: 'saved', undone: 1 });
    });

    it('extracts quantity with the shared parser and resolves a named list', async () => {
      const pharmacy = unwrap(await lists.createList({ title: 'Pharmacy' }));

      const outcome = await receive(
        intent('addListItem', { text: 'two packs of aspirin', listName: 'pharmacy' }),
      );

      expect(outcome).toMatchObject({ kind: 'saved', message: 'Saved to Pharmacy' });
      expect(unwrap(await lists.getItems(pharmacy.id)).active).toEqual([
        expect.objectContaining({ title: 'Aspirin', quantity: 2, unit: 'packs' }),
      ]);
    });

    it('opens list selection for an unknown list instead of creating it', async () => {
      const outcome = await receive(
        intent('addListItem', { text: 'Water', listName: 'Groceries' }),
      );

      expect(outcome).toMatchObject({ kind: 'needsInput', message: SYSTEM_VOICE_TEXT.needsInput });
      expect(voice.services.session.getState().pending).toMatchObject({
        intro: SYSTEM_VOICE_TEXT.needsInput,
        draft: {
          kind: 'listItem',
          title: 'Water',
          targetListId: null,
          ambiguities: [{ type: 'listNotFound', listName: 'Groceries' }],
        },
      });
      expect((await lists.getLists()).map((list) => list.title)).toEqual(['Shopping']);
      expect(await db.all('SELECT id FROM list_items')).toEqual([]);
    });

    it('asks for the item when Siri passed no text', async () => {
      expect(await receive(intent('addListItem'))).toMatchObject({ kind: 'needsInput' });
      expect(voice.services.session.getState().pending?.draft.missingFields).toContain('title');
    });
  });

  describe('tasks', () => {
    it('captures a Future task without a priority', async () => {
      const outcome = await receive(intent('captureFutureTask', { text: 'Renew my passport' }));

      expect(outcome).toMatchObject({ kind: 'saved', message: SYSTEM_VOICE_TEXT.savedToFuture });
      expect(await tasks.getFuturePool()).toEqual([
        expect.objectContaining({
          title: 'Renew my passport',
          priority: null,
          scheduledDate: null,
        }),
      ]);

      const intentId = outcome.kind === 'saved' ? outcome.intentId : '';
      expect(await voice.services.session.undoNotice()).toBe(true);
      expect(await entry.services.adapter.undo(intentId)).toBe(true);
      expect(await tasks.getFuturePool()).toEqual([]);
    });

    it('never saves a ranked task without a priority', async () => {
      const outcome = await receive(
        intent('captureFutureTask', { text: 'Call John', date: TOMORROW }),
      );

      expect(outcome).toMatchObject({ kind: 'needsInput' });
      expect(voice.services.session.getState().pending?.draft).toMatchObject({
        kind: 'rankedTask',
        date: TOMORROW,
        missingFields: ['priority'],
      });
      expect(await tasks.getDeck(TOMORROW)).toEqual([]);
    });

    it('adds a ranked task with a free priority to Your matches', async () => {
      const outcome = await receive(
        intent('captureFutureTask', { text: 'Call John', date: TOMORROW, priority: '4' }),
      );

      expect(outcome).toMatchObject({
        kind: 'saved',
        message: SYSTEM_VOICE_TEXT.addedToMatches,
        destination: { screen: 'matches', date: TOMORROW },
      });
      expect(await tasks.getDeck(TOMORROW)).toEqual([
        expect.objectContaining({ title: 'Call John', priority: 4 }),
      ]);
    });

    it('opens Preview on a priority conflict without moving existing tasks', async () => {
      unwrap(await tasks.createTask({ title: 'Busy', scheduledDate: TOMORROW, priority: 4 }));

      const outcome = await receive(
        intent('captureFutureTask', { text: 'Call John', date: TOMORROW, priority: 4 }),
      );

      expect(outcome).toMatchObject({ kind: 'needsInput' });
      expect(voice.services.session.getState().pending?.error).toContain('already taken by "Busy"');
      expect((await tasks.getDeck(TOMORROW)).map((task) => [task.title, task.priority])).toEqual([
        ['Busy', 4],
      ]);
    });

    it('opens Preview for a past date and never saves automatically', async () => {
      const outcome = await receive(
        intent('captureFutureTask', { text: 'Pay rent', date: YESTERDAY, priority: 2 }),
      );

      expect(outcome).toMatchObject({ kind: 'needsInput' });
      expect(await tasks.getDeck(YESTERDAY)).toEqual([]);
    });

    it('turns a domain error into Preview without a partial save', async () => {
      const outcome = await receive(
        intent('captureFutureTask', {
          text: 'Remind me today at 6:00 to buy tickets',
          date: TODAY,
          priority: 2,
        }),
      );

      expect(outcome).toMatchObject({ kind: 'needsInput' });
      expect(await db.all('SELECT id FROM tasks')).toEqual([]);
      expect(await db.get('SELECT status FROM voice_entry_intents')).toEqual({
        status: 'needsInput',
      });
    });
  });

  describe('calendar events', () => {
    it('opens Preview with a suggested end when no duration was given', async () => {
      const outcome = await receive(
        intent('createCalendarEvent', { text: 'Dentist', date: TOMORROW, time: '09:00' }),
      );

      expect(outcome).toMatchObject({ kind: 'needsInput' });
      expect(voice.services.session.getState().pending?.draft).toMatchObject({
        kind: 'calendarEvent',
        eventStart: `${TOMORROW}T09:00`,
        eventEnd: `${TOMORROW}T10:00`,
        ambiguities: [{ type: 'eventEndSuggested', suggestedEnd: `${TOMORROW}T10:00` }],
      });
      expect(await events.listEventsInRange(TOMORROW, TOMORROW)).toEqual([]);
    });

    it('adds an event with a duration to Calendar', async () => {
      const outcome = await receive(
        intent('createCalendarEvent', {
          text: 'Dentist',
          date: TOMORROW,
          time: '09:00',
          durationMinutes: 30,
        }),
      );

      expect(outcome).toMatchObject({ kind: 'saved', message: SYSTEM_VOICE_TEXT.addedToCalendar });
      expect(await events.listEventsInRange(TOMORROW, TOMORROW)).toEqual([
        expect.objectContaining({
          title: 'Dentist',
          startAt: '2026-09-12T07:00:00.000Z',
          endAt: '2026-09-12T07:30:00.000Z',
        }),
      ]);
    });
  });

  describe('navigation', () => {
    it('opens today in Your matches', async () => {
      expect(await receive(intent('openToday'))).toEqual({
        kind: 'navigate',
        destination: { screen: 'matches', date: TODAY },
      });
    });

    it('starts the existing voice capture', async () => {
      expect(await receive(intent('openVoiceCapture'))).toEqual({
        kind: 'startVoiceCapture',
        hint: { kind: 'rankedTask', date: TODAY },
      });
    });
  });

  describe('safety and idempotency', () => {
    it('does not process the same intent id twice', async () => {
      const payload = intent('addListItem', { text: 'Milk' });

      const [first, second] = await Promise.all([receive(payload), receive(payload)]);
      const third = await receive(payload);

      expect([first.kind, second.kind, third.kind].sort()).toEqual([
        'duplicate',
        'duplicate',
        'saved',
      ]);
      expect(await shoppingItems()).toHaveLength(1);
    });

    it('rejects invalid payloads without technical details and without writing', async () => {
      const outcomes = await Promise.all([
        receive(intent('addListItem', { text: 'Milk', version: '9' })),
        receive(intent('captureFutureTask', { priority: 42 })),
        receive(intent('addListItem', { createdAt: '2026-09-11T07:00:00Z' })),
      ]);

      expect(outcomes).toEqual([
        { kind: 'rejected', message: SYSTEM_VOICE_TEXT.notUnderstood },
        { kind: 'rejected', message: SYSTEM_VOICE_TEXT.notUnderstood },
        { kind: 'rejected', message: SYSTEM_VOICE_TEXT.notUnderstood },
      ]);
      expect(await db.all('SELECT intent_id FROM voice_entry_intents')).toEqual([]);
    });

    it('never saves directly from an external deep link', async () => {
      const outcome = await receive(
        { version: '1', action: 'addListItem', text: 'Milk', intentId: 'external-0001' },
        'deepLink',
      );

      expect(outcome).toMatchObject({ kind: 'needsInput' });
      expect(await db.all('SELECT id FROM list_items')).toEqual([]);
    });

    it('cannot delete or complete tasks through a deep link', async () => {
      const task = unwrap(
        await tasks.createTask({ title: 'Keep me', scheduledDate: TODAY, priority: 5 }),
      );

      for (const action of [
        'deleteTask',
        'delete',
        'completeTask',
        'done',
        'postponeUntilTomorrow',
      ]) {
        expect(
          await receive(
            { version: '1', action, taskId: task.id, intentId: `evil-${action}` },
            'deepLink',
          ),
        ).toEqual({ kind: 'rejected', message: SYSTEM_VOICE_TEXT.notUnderstood });
      }

      expect(unwrap(await tasks.getTask(task.id))).toMatchObject({ status: 'active' });
      expect(await tasks.getDeck(TODAY)).toHaveLength(1);
    });

    it('reports a SQLite error without a false confirmation', async () => {
      const broken = failingDatabase(db, 'list_items');
      voice.services.dispose();
      setup({ tasks, events, lists: createTestListService(broken) });

      const outcome = await receive(intent('addListItem', { text: 'Milk' }));

      expect(outcome).toEqual({ kind: 'failed', message: SYSTEM_VOICE_TEXT.failed });
      expect(voice.services.session.getState().notice).toBeNull();
      expect(await db.all('SELECT id FROM list_items')).toEqual([]);
    });

    it('understands Russian and English locales with the shared parser', async () => {
      const russian = await receive(
        intent('addListItem', { text: 'две бутылки воды', locale: 'ru-RU' }),
      );
      const english = await receive(
        intent('captureFutureTask', { text: 'call mom tomorrow priority seven', locale: 'en-GB' }),
      );

      expect(russian).toMatchObject({ kind: 'saved', message: 'Saved to Shopping' });
      expect(await shoppingItems()).toEqual([
        expect.objectContaining({ title: 'Воды', quantity: 2, unit: 'бутылки' }),
      ]);
      expect(english).toMatchObject({ kind: 'saved', message: SYSTEM_VOICE_TEXT.addedToMatches });
      expect(await tasks.getDeck(TOMORROW)).toEqual([
        expect.objectContaining({ title: 'Call mom', priority: 7 }),
      ]);
    });
  });
});

describe('VoiceEntryInbox', () => {
  it('processes a cold-start queue, warm deliveries, consecutive intents and redelivery once each', async () => {
    const db = await createTestDatabase();
    const lists = createTestListService(db);
    const voice = createTestVoice(db, {
      tasks: createTestService(db),
      events: createTestEventService(db),
      lists,
    });
    const bridge = createFakeNativeVoiceEntryBridge();
    const cold = intent('addListItem', { text: 'Milk' });
    const second = intent('addListItem', { text: 'Bread' });
    bridge.queue({ source: 'iosAppIntent', payload: cold });
    bridge.queue({ source: 'iosAppIntent', payload: second });
    const entry = createTestSystemVoiceEntry(db, { voice, lists, bridge });
    const inbox = createVoiceEntryInbox(entry.services.adapter, bridge);
    const outcomes: string[] = [];
    const states: boolean[] = [];
    inbox.onOutcome((outcome) => outcomes.push(outcome.kind));
    inbox.subscribe((state) => states.push(state.processing));

    expect(inbox.getState().processing).toBe(true);
    const stop = inbox.start();
    await new Promise((resolve) => setImmediate(resolve));
    await inbox.drainNative();
    await new Promise((resolve) => setImmediate(resolve));

    bridge.deliver({ source: 'iosAppIntent', payload: intent('addListItem', { text: 'Eggs' }) });
    bridge.deliver({ source: 'iosAppIntent', payload: cold });
    await new Promise((resolve) => setImmediate(resolve));
    await inbox.drainNative();
    for (let tick = 0; tick < 5; tick++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const [shopping] = await lists.getLists();
    expect(
      unwrap(await lists.getItems(shopping?.id ?? '')).active.map((item) => item.title),
    ).toEqual(['Milk', 'Bread', 'Eggs']);
    expect(outcomes).toEqual(['saved', 'saved', 'saved', 'duplicate']);
    expect(inbox.getState().processing).toBe(false);
    expect(states.at(-1)).toBe(false);

    stop();
    expect(bridge.listenerCount()).toBe(0);
    voice.services.dispose();
    db.close();
  });
});
