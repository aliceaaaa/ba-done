import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import type { CalendarEventService } from '@/entities/calendar-event';
import type { ListService } from '@/entities/list';
import type { TaskService } from '@/entities/task';
import { HANDS_FREE_TOGGLE_LABEL } from '@/shared/config/voice-config';
import {
  TODAY,
  TOMORROW,
  createTestDatabase,
  createTestEventService,
  createTestListService,
  createTestReminders,
  createTestService,
  createTestVoice,
  renderApp,
  unwrap,
  type TestVoice,
} from '@/test-utils/test-app';

import {
  SPEECH_DENIED,
  SPEECH_GRANTED,
  SPEECH_UNDETERMINED,
  type FakeSpeechOptions,
} from '../testing/fake-speech-recognition-adapter';
import { MIC_LABELS } from '../ui/mic-button';
import { PREVIEW_TEXT } from '../ui/voice-command-preview-screen';
import { VOICE_HOST_TEXT } from '../ui/voice-host';
import { VOICE_SETTINGS_TEXT } from '../ui/voice-settings-section';

describe('Voice screens', () => {
  let db: NodeSqliteDatabase;
  let tasks: TaskService;
  let events: CalendarEventService;
  let lists: ListService;
  let voice: TestVoice;

  function setupVoice(options: FakeSpeechOptions = {}) {
    voice = createTestVoice(db, { tasks, events, lists, permission: SPEECH_GRANTED, ...options });
  }

  function render(url: string) {
    return renderApp(tasks, url, undefined, events, { lists, voice });
  }

  function renderSettings() {
    const reminders = createTestReminders(db);
    return renderApp(reminders.service, '/settings', reminders, undefined, { lists, voice });
  }

  async function speak(transcript: string, buttonTestId = 'mic-button') {
    await fireEvent.press(
      screen.getAllByTestId(buttonTestId)[0] ?? screen.getByTestId(buttonTestId),
    );
    await screen.findAllByRole('button', { name: MIC_LABELS.stop });
    await act(async () => {
      voice.adapter.emitFinal(transcript);
    });
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    tasks = createTestService(db);
    events = createTestEventService(db);
    lists = createTestListService(db);
    setupVoice();
  });

  afterEach(() => {
    voice.services.dispose();
    db.close();
  });

  it.each([
    ['Your matches', '/', 'mic-button'],
    ['Future', '/future', 'mic-button'],
    ['Calendar', '/calendar', 'calendar-mic-button'],
  ])('offers the microphone on %s', async (_name, url, testId) => {
    await render(url);

    const mic = await screen.findByTestId(testId);

    expect(mic.props.accessibilityLabel).toBe(MIC_LABELS.start);
    expect(mic.props.accessibilityRole).toBe('button');
  });

  it('offers the microphone in the Calendar Create menu', async () => {
    await render('/calendar');
    await fireEvent.press(await screen.findByRole('button', { name: 'Create' }));
    expect(
      within(screen.getByTestId('create-menu')).getByTestId('create-menu-mic-button'),
    ).toBeTruthy();

    await fireEvent.press(
      within(screen.getByTestId('create-menu')).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByTestId('create-menu')).toBeNull();
  });

  it('offers the microphone inside a list', async () => {
    const [shopping] = await lists.getLists();
    await render(`/list/${shopping?.id}`);

    expect(await screen.findByRole('button', { name: MIC_LABELS.start })).toBeTruthy();
  });

  it('adds a spoken item to the open list at once and offers Undo', async () => {
    const [shopping] = await lists.getLists();
    await render(`/list/${shopping?.id}`);
    await screen.findByLabelText('Add item');

    await speak('two bottles of water');

    expect(await screen.findByText('Added to Shopping: Water')).toBeTruthy();
    expect(await screen.findByText('2 bottles')).toBeTruthy();
    expect(voice.adapter.calls.start[0]).toMatchObject({ mode: 'manual' });

    await fireEvent.press(screen.getByRole('button', { name: VOICE_HOST_TEXT.undo }));

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Water' })).toBeNull());
    expect(unwrap(await lists.getItems(shopping?.id ?? '')).active).toEqual([]);
  });

  it('lets the user edit the preview before saving a ranked task', async () => {
    unwrap(await tasks.createTask({ title: 'Busy', scheduledDate: TOMORROW, priority: 5 }));
    await render('/');
    await screen.findByRole('button', { name: MIC_LABELS.start });

    await speak('Add call John tomorrow');

    expect(await screen.findByTestId('voice-command-preview')).toBeTruthy();
    expect(screen.getByTestId('voice-transcript')).toHaveTextContent('Add call John tomorrow');
    expect(screen.getByTestId('voice-missing')).toHaveTextContent('Missing: Priority');
    const taken = await screen.findByTestId('priority-option-5');
    expect(taken.props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(
      screen.getByLabelText(PREVIEW_TEXT.itemTitle),
      'Call John about the trip',
    );
    await fireEvent.press(screen.getByTestId('priority-option-8'));
    await fireEvent.press(screen.getByRole('button', { name: PREVIEW_TEXT.save }));

    await waitFor(async () =>
      expect((await tasks.getDeck(TOMORROW)).map((task) => [task.title, task.priority])).toEqual([
        ['Call John about the trip', 8],
        ['Busy', 5],
      ]),
    );
    expect(voice.services.session.getState().pending).toBeNull();
  });

  it('switches the type in the preview and saves an event with the native pickers', async () => {
    await render('/calendar');
    await screen.findByTestId('calendar-mic-button');

    await speak('Dentist tomorrow at 12', 'calendar-mic-button');

    await screen.findByTestId('voice-command-preview');
    expect(screen.getByTestId('voice-warnings')).toHaveTextContent(/Is this a task or an event\?/);
    await fireEvent.press(screen.getByRole('radio', { name: 'Event' }));
    expect(screen.getByLabelText(PREVIEW_TEXT.startTime)).toBeTruthy();
    expect(screen.getByLabelText(PREVIEW_TEXT.endTime)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: PREVIEW_TEXT.save }));

    await waitFor(async () =>
      expect(await events.listEventsInRange(TOMORROW, TOMORROW)).toEqual([
        expect.objectContaining({ title: 'Dentist', startAt: '2026-09-12T10:00:00.000Z' }),
      ]),
    );
    expect(await tasks.getDeck(TOMORROW)).toEqual([]);
  });

  it('saves nothing when the preview is cancelled', async () => {
    await render('/future');
    await screen.findByRole('button', { name: MIC_LABELS.start });

    await speak('Create an event dentist tomorrow at 9 am');

    await screen.findByTestId('voice-command-preview');
    expect(screen.getByTestId('voice-warnings')).toHaveTextContent(/Suggested end/);
    await fireEvent.press(screen.getByRole('button', { name: PREVIEW_TEXT.cancel }));

    await waitFor(() => expect(screen.queryByTestId('voice-command-preview')).toBeNull());
    expect(voice.services.session.getState().pending).toBeNull();
    expect(await events.listEventsInRange(TODAY, TOMORROW)).toEqual([]);
    expect(await tasks.getFuturePool()).toEqual([]);
  });

  it('offers Open settings when permission is denied', async () => {
    setupVoice({ permission: SPEECH_DENIED });
    await render('/future');

    await fireEvent.press(await screen.findByRole('button', { name: MIC_LABELS.start }));

    expect(await screen.findByText(VOICE_HOST_TEXT.permissionDenied)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: VOICE_HOST_TEXT.openSettings }));
    expect(voice.openSettings).toHaveBeenCalledTimes(1);
    expect(voice.adapter.calls.start).toEqual([]);
  });

  it('announces every microphone state with text and accessibility labels', async () => {
    await render('/future');
    const mic = await screen.findByTestId('mic-button');
    expect(mic.props.accessibilityLabel).toBe(MIC_LABELS.start);

    await fireEvent.press(mic);

    const stop = await screen.findByTestId('mic-button');
    expect(stop.props.accessibilityLabel).toBe(MIC_LABELS.stop);
    expect(stop.props.accessibilityValue).toEqual({ text: MIC_LABELS.listening });
    expect(
      within(screen.getByTestId('voice-listening-panel')).getByRole('header'),
    ).toHaveTextContent(new RegExp(MIC_LABELS.listening));

    await act(async () => {
      voice.adapter.emitPartial('add m');
    });
    expect(screen.getByText('add m')).toBeTruthy();

    await fireEvent.press(
      within(screen.getByTestId('voice-listening-panel')).getByRole('button', {
        name: MIC_LABELS.stop,
      }),
    );

    expect(screen.getByTestId('mic-button').props.accessibilityLabel).toBe(MIC_LABELS.processing);
    expect(screen.getByTestId('mic-button').props.accessibilityState).toMatchObject({ busy: true });

    await fireEvent.press(
      within(screen.getByTestId('voice-listening-panel')).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.getByTestId('mic-button').props.accessibilityLabel).toBe(MIC_LABELS.start);
  });

  it('keeps hands-free off by default, needs confirmation and stops in the background', async () => {
    setupVoice({ permission: SPEECH_UNDETERMINED });
    await renderSettings();

    const toggle = await screen.findByLabelText(HANDS_FREE_TOGGLE_LABEL);
    expect(toggle.props.value).toBe(false);
    expect(voice.adapter.calls.request).toBe(0);
    expect(screen.queryByTestId('hands-free-indicator')).toBeNull();

    await fireEvent(toggle, 'valueChange', true);

    expect(voice.adapter.calls.request).toBe(1);
    expect(await screen.findByText(VOICE_HOST_TEXT.handsFreeReady, { exact: false })).toBeTruthy();
    expect(voice.adapter.calls.start).toEqual([]);
    expect(
      await db.get("SELECT value FROM app_settings WHERE key = 'voice.handsFreeEnabled'"),
    ).toEqual({ value: 'true' });

    await fireEvent.press(screen.getByRole('button', { name: VOICE_HOST_TEXT.handsFreeStart }));

    expect(
      await screen.findByText(VOICE_HOST_TEXT.handsFreeListening, { exact: false }),
    ).toBeTruthy();
    expect(voice.adapter.calls.start.map((call) => call.mode)).toEqual(['handsFree']);

    await act(async () => {
      voice.appState.set('background');
    });

    expect(voice.adapter.isListening()).toBe(false);
    expect(
      await screen.findByText('Hands-free stopped because the app left the screen.', {
        exact: false,
      }),
    ).toBeTruthy();

    await act(async () => {
      voice.appState.set('active');
    });
    expect(voice.adapter.calls.start).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: VOICE_HOST_TEXT.handsFreeResume }));
    expect(voice.adapter.calls.start).toHaveLength(2);

    await fireEvent(screen.getByLabelText(HANDS_FREE_TOGGLE_LABEL), 'valueChange', false);
    await waitFor(() => expect(screen.queryByTestId('hands-free-indicator')).toBeNull());
    expect(voice.adapter.isListening()).toBe(false);
  });

  it('shows a spoken Future task in Future right away', async () => {
    await render('/future');
    expect(await screen.findByText('No tasks without a date')).toBeTruthy();

    await speak('Add a future task to renew my passport');

    expect(await screen.findByText('Renew my passport')).toBeTruthy();
    expect(screen.getByText('Added to Future: Renew my passport')).toBeTruthy();
    const [task] = await tasks.getFuturePool();
    expect(task).toMatchObject({ priority: null, scheduledDate: null });
  });

  it('runs a hands-free wake command in the foreground and waits for the next one', async () => {
    await db.run("INSERT INTO app_settings (key, value) VALUES ('voice.handsFreeEnabled', 'true')");
    const [shopping] = await lists.getLists();
    await render(`/list/${shopping?.id}`);

    await fireEvent.press(
      await screen.findByRole('button', { name: VOICE_HOST_TEXT.handsFreeStart }),
    );
    expect(
      await screen.findByText(VOICE_HOST_TEXT.handsFreeListening, { exact: false }),
    ).toBeTruthy();

    await act(async () => {
      voice.adapter.emitFinal('milk');
    });
    expect(screen.queryByRole('checkbox', { name: 'Milk' })).toBeNull();
    await act(async () => {
      await voice.scheduler.runNext();
    });

    await act(async () => {
      voice.adapter.emitFinal('Hey app, add eggs');
    });

    expect(await screen.findByRole('checkbox', { name: 'Eggs' })).toBeTruthy();
    await waitFor(() => expect(voice.adapter.calls.start).toHaveLength(3));
    expect(voice.adapter.calls.start.every((call) => call.mode === 'handsFree')).toBe(true);
    expect(screen.getByText(VOICE_HOST_TEXT.handsFreeListening, { exact: false })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: VOICE_HOST_TEXT.handsFreeStop }));
    expect(voice.adapter.isListening()).toBe(false);
    expect(await screen.findByText('Hands-free is paused.', { exact: false })).toBeTruthy();
  });

  it('does not start listening after a cold launch even when hands-free was enabled', async () => {
    await db.run("INSERT INTO app_settings (key, value) VALUES ('voice.handsFreeEnabled', 'true')");
    await render('/');

    expect(await screen.findByText(VOICE_HOST_TEXT.handsFreeReady, { exact: false })).toBeTruthy();
    expect(voice.adapter.calls.start).toEqual([]);
    expect(voice.adapter.calls.request).toBe(0);
  });

  it('switches the recognition language', async () => {
    await renderSettings();

    await fireEvent.press(await screen.findByRole('radio', { name: 'Russian' }));

    await waitFor(async () =>
      expect(
        await db.get("SELECT value FROM app_settings WHERE key = 'voice.recognitionLanguage'"),
      ).toEqual({ value: 'ru-RU' }),
    );
    await act(async () => {
      await voice.services.startManual({ kind: 'futureTask' });
    });
    expect(voice.adapter.calls.start[0]?.locale).toBe('ru-RU');
    expect(screen.getByText(VOICE_SETTINGS_TEXT.processing)).toBeTruthy();
    expect(screen.getByRole('button', { name: VOICE_SETTINGS_TEXT.deleteHistory })).toBeTruthy();
  });

  it('keeps manual input available when the voice API is completely unavailable', async () => {
    setupVoice({ available: false });
    const [shopping] = await lists.getLists();
    await render(`/list/${shopping?.id}`);

    await fireEvent.press(await screen.findByRole('button', { name: MIC_LABELS.unavailable }));

    expect(await screen.findByText(VOICE_HOST_TEXT.unavailable)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Add item'), 'Bread');
    await fireEvent(screen.getByLabelText('Add item'), 'submitEditing');
    expect(await screen.findByRole('checkbox', { name: 'Bread' })).toBeTruthy();
    expect(voice.adapter.calls.request).toBe(0);
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('shows the unavailable microphone state without hiding manual task creation', async () => {
    setupVoice({ available: false });
    await render('/');

    expect(await screen.findByRole('button', { name: MIC_LABELS.unavailable })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New task' })).toBeTruthy();
  });
});
