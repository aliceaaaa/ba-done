import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import { reminderNotificationId } from '@/entities/reminder';
import type { CreateTaskInput, RankedTask } from '@/entities/task';
import {
  TODAY,
  TOMORROW,
  createTestDatabase,
  createTestReminders,
  mockAlert,
  pickDateTime,
  pressAlertButton,
  renderApp,
  unwrap,
  type TestReminders,
} from '@/test-utils/test-app';

import { REMINDER_ACTIONS, type NotificationResponseInput } from '../model/notification-adapter';
import { DENIED, GRANTED, UNDETERMINED } from '../testing/fake-notification-adapter';

describe('Reminder screens', () => {
  let db: NodeSqliteDatabase;
  let app: TestReminders;

  async function create(input: Partial<CreateTaskInput> = {}): Promise<RankedTask> {
    return unwrap(
      await app.service.createTask({
        title: 'Dentist',
        scheduledDate: TODAY,
        priority: 5,
        reminder: { type: 'exact', localDateTime: '2026-09-11T19:30' },
        ...input,
      }),
    );
  }

  function responseFor(taskId: string, actionIdentifier: string): NotificationResponseInput {
    const request = app.adapter.scheduled.get(reminderNotificationId(taskId));
    if (request === undefined) {
      throw new Error('Expected a scheduled notification');
    }
    return {
      responseId: `${request.identifier}:1789000000000:${actionIdentifier}`,
      actionIdentifier,
      data: { ...request.data },
    };
  }

  async function render(url = '/') {
    await renderApp(app.service, url, app);
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    app = createTestReminders(db, { permission: GRANTED });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db.close();
  });

  describe('notification responses', () => {
    it('opens the details of the tapped task on cold start', async () => {
      await create({ title: 'Other', priority: 9 });
      const task = await create();
      app.adapter.setLastResponse(responseFor(task.id, REMINDER_ACTIONS.open));

      await render();

      expect(await screen.findByTestId('task-details')).toBeTruthy();
      expect(screen.getByRole('header', { name: 'Dentist' })).toBeTruthy();
      expect(await app.adapter.getLastResponse()).toBeNull();
    });

    it('opens the details when the notification is tapped while the app is open', async () => {
      const task = await create();
      await render();
      await screen.findByText('Your matches');

      await act(async () => {
        app.adapter.emitResponse(responseFor(task.id, REMINDER_ACTIONS.open));
      });

      expect(await screen.findByTestId('task-details')).toBeTruthy();
    });

    it('refreshes the open deck after Done from a notification', async () => {
      const task = await create();
      await render();
      await screen.findByTestId(`task-card-${task.id}`);

      await act(async () => {
        app.adapter.emitResponse(responseFor(task.id, REMINDER_ACTIONS.done));
      });

      expect(await screen.findByTestId('empty-deck')).toBeTruthy();
      expect(app.adapter.scheduled.size).toBe(0);
    });

    it('opens the priority picker of the right task on Change priority', async () => {
      const task = await create();
      await render();
      await screen.findByText('Your matches');

      await act(async () => {
        app.adapter.emitResponse(responseFor(task.id, REMINDER_ACTIONS.changePriority));
      });

      expect(await screen.findByTestId('change-priority')).toBeTruthy();
      expect(screen.getByText('Dentist')).toBeTruthy();
    });
  });

  describe('Remind me later', () => {
    it('changes only the reminder time and records it in history', async () => {
      const task = await create({ priority: 7 });
      await render(`/task/${task.id}/remind-later`);

      for (const label of ['15 minutes', '1 hour', 'Tonight', 'Tomorrow', 'Pick a time']) {
        expect(await screen.findByRole('button', { name: label })).toBeTruthy();
      }
      await fireEvent.press(screen.getByRole('button', { name: 'Tomorrow' }));

      await waitFor(async () =>
        expect(unwrap(await app.service.getTask(task.id)).reminder).toEqual({
          type: 'exact',
          localDateTime: '2026-09-12T09:00',
          timeZone: 'Europe/Berlin',
        }),
      );
      expect(unwrap(await app.service.getTask(task.id))).toMatchObject({
        scheduledDate: TODAY,
        placementType: 'ranked',
        priority: 7,
      });
      expect((await app.service.getHistory(task.id)).map((event) => event.type)).toEqual([
        'reminderSnoozed',
      ]);
      expect(app.adapter.calls.cancel).toContain(reminderNotificationId(task.id));
      expect(app.adapter.scheduled.get(reminderNotificationId(task.id))?.fireAt).toEqual(
        new Date('2026-09-12T07:00:00.000Z'),
      );
      expect(app.adapter.scheduled.size).toBe(1);
    });

    it('saves a picked date and time as a normalized local value', async () => {
      const task = await create();
      await render(`/task/${task.id}/remind-later`);

      await fireEvent.press(await screen.findByRole('button', { name: 'Pick a time' }));
      await pickDateTime('Reminder date', new Date(2026, 8, 13, 12, 0));
      await pickDateTime('Reminder time', new Date(2026, 0, 1, 7, 45));
      await fireEvent.press(screen.getByRole('button', { name: 'Save reminder' }));

      await waitFor(async () =>
        expect(unwrap(await app.service.getTask(task.id)).reminder).toMatchObject({
          localDateTime: '2026-09-13T07:45',
        }),
      );
      expect(unwrap(await app.service.getTask(task.id)).scheduledDate).toBe(TODAY);
    });
  });

  describe('Change priority', () => {
    it('keeps the current priority available for a ranked task', async () => {
      const task = await create({ priority: 5 });
      await create({ title: 'Busy', priority: 8, reminder: null });
      await render(`/task/${task.id}/priority`);

      expect(await screen.findByTestId('priority-option-5')).toBeEnabled();
      expect(screen.getByTestId('priority-option-5')).toBeSelected();
      expect(screen.getByTestId('priority-option-8')).toBeDisabled();

      await fireEvent.press(screen.getByTestId('priority-option-9'));
      await fireEvent.press(screen.getByRole('button', { name: 'Save priority' }));

      await waitFor(async () =>
        expect(unwrap(await app.service.getTask(task.id)).priority).toBe(9),
      );
    });

    it('lets a Mega Crush stay or become a ranked task', async () => {
      const task = await create();
      unwrap(await app.service.postponeUntilTomorrow(task.id));
      await render(`/task/${task.id}/priority`);

      expect(await screen.findByText('Mega Crush')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Keep Mega Crush' })).toBeTruthy();

      await fireEvent.press(await screen.findByTestId('priority-option-4'));
      await fireEvent.press(screen.getByRole('button', { name: 'Save priority' }));

      await waitFor(async () =>
        expect(unwrap(await app.service.getTask(task.id))).toMatchObject({
          scheduledDate: TOMORROW,
          placementType: 'ranked',
          priority: 4,
          carryOverOrder: null,
        }),
      );
      expect(await screen.findByTestId('task-details')).toBeTruthy();
      expect(screen.queryByText('Mega Crush')).toBeNull();
    });
  });

  describe('permissions', () => {
    it('does not ask at startup and asks when a reminder is first saved', async () => {
      app = createTestReminders(db, { permission: UNDETERMINED, requestResult: GRANTED });
      await render('/task/new?date=2026-09-11');
      await screen.findByTestId('task-editor');

      expect(app.adapter.calls.request).toBe(0);
      expect(app.adapter.calls.initialize).toBe(1);

      await fireEvent.changeText(screen.getByLabelText('Title'), 'Dentist');
      await fireEvent.press(await screen.findByTestId('priority-option-6'));
      await fireEvent.press(screen.getByRole('radio', { name: 'At a date and time' }));
      await pickDateTime('Reminder time', new Date(2026, 0, 1, 20, 15));
      await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(app.adapter.scheduled.size).toBe(1));
      expect(app.adapter.calls.request).toBe(1);
      const [task] = await app.service.getDeck(TODAY);
      expect(task?.reminder).toEqual({
        type: 'exact',
        localDateTime: '2026-09-11T20:15',
        timeZone: 'Europe/Berlin',
      });
    });

    it('explains denied notifications without blocking and offers system settings', async () => {
      app = createTestReminders(db, { permission: UNDETERMINED, requestResult: DENIED });
      const task = await create();
      await render(`/task/${task.id}/edit`);
      await screen.findByTestId('task-editor');

      await fireEvent.changeText(screen.getByLabelText('Title'), 'Dentist visit');
      await pickDateTime('Reminder time', new Date(2026, 0, 1, 21, 0));
      await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      const notice = within(await screen.findByTestId('notice-bar'));
      expect(notice.getByText(/Notifications are turned off/)).toBeTruthy();
      await fireEvent.press(notice.getByRole('button', { name: 'Open settings' }));

      expect(app.adapter.calls.openSettings).toBe(1);
      expect(unwrap(await app.service.getTask(task.id))).toMatchObject({
        title: 'Dentist visit',
        reminder: { localDateTime: '2026-09-11T21:00' },
      });
      expect(await app.coordinator.getSchedule(task.id)).toMatchObject({
        reminderScheduleStatus: 'permissionDenied',
      });
      expect(await screen.findByText('Notifications are turned off')).toBeTruthy();
    });

    it('shows the scheduled and failed states on the task card', async () => {
      const task = await create();
      await render(`/task/${task.id}`);

      expect(await screen.findByText('Reminder scheduled')).toBeTruthy();

      app.adapter.failNextSchedule('boom');
      unwrap(
        await app.service.updateTask(task.id, {
          reminder: { type: 'exact', localDateTime: '2026-09-11T22:00' },
        }),
      );

      expect(await screen.findByText('Reminder could not be scheduled')).toBeTruthy();
      expect(screen.queryByText('boom')).toBeNull();
    });
  });

  describe('Future and settings', () => {
    it('clears and cancels the reminder after confirming the move to Future', async () => {
      const alert = mockAlert();
      const task = await create();
      await render(`/task/${task.id}/edit`);
      await screen.findByTestId('task-editor');

      await fireEvent.press(screen.getByRole('radio', { name: 'Future' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(alert).toHaveBeenCalled());
      expect(app.adapter.scheduled.size).toBe(1);

      await pressAlertButton(alert, 'Turn off and move');

      await waitFor(async () =>
        expect(unwrap(await app.service.getTask(task.id))).toMatchObject({
          scheduledDate: null,
          reminder: null,
        }),
      );
      expect(app.adapter.scheduled.size).toBe(0);
    });

    it('edits day period times with a native picker and reschedules related reminders', async () => {
      const task = await create({ reminder: { type: 'dayPeriod', period: 'evening' } });
      await render('/settings');
      await screen.findByTestId('settings');

      await pickDateTime('Evening time', new Date(2026, 0, 1, 20, 30));

      await waitFor(async () =>
        expect((await app.coordinator.getDayPeriodTimes()).evening).toBe('20:30'),
      );
      await waitFor(() =>
        expect(app.adapter.scheduled.get(reminderNotificationId(task.id))?.fireAt).toEqual(
          new Date('2026-09-11T18:30:00.000Z'),
        ),
      );
      expect(app.adapter.scheduled.size).toBe(1);
    });
  });
});
