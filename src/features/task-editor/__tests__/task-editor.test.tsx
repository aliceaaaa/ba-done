import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import type { CreateTaskInput, RankedTask, TaskService } from '@/entities/task';
import {
  TODAY,
  TOMORROW,
  createTestDatabase,
  createTestService,
  mockAlert,
  pickDateTime,
  pressAlertButton,
  renderApp,
  unwrap,
} from '@/test-utils/test-app';
import { pickerDateToLocalTime } from '@/shared/lib/picker-values';

describe('TaskEditor', () => {
  let db: NodeSqliteDatabase;
  let service: TaskService;

  async function create(input: Partial<CreateTaskInput> = {}): Promise<RankedTask> {
    return unwrap(
      await service.createTask({ title: 'Task', scheduledDate: TODAY, priority: 5, ...input }),
    );
  }

  async function openEditor(taskId: string) {
    await renderApp(service, `/task/${taskId}/edit`);
    await screen.findByTestId('task-editor');
  }

  async function save() {
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    service = createTestService(db);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db.close();
  });

  it('creates a scheduled task on the chosen day and shows it in the right place', async () => {
    const high = await create({ title: 'High', priority: 10 });
    const low = await create({ title: 'Low', priority: 3 });
    await renderApp(service);
    await fireEvent.press(await screen.findByRole('button', { name: 'New task' }));
    await screen.findByTestId('task-editor');

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Middle');
    await fireEvent.press(await screen.findByTestId('priority-option-7'));
    await save();

    await waitFor(() => expect(screen.queryAllByTestId(/^task-card-/)).toHaveLength(3));
    const deck = await service.getDeck(TODAY);
    expect(deck.map((task) => task.title)).toEqual(['High', 'Middle', 'Low']);
    expect(deck[1]).toMatchObject({ placementType: 'ranked', priority: 7, carryOverOrder: null });
    expect([high.id, low.id].every((id) => deck.some((task) => task.id === id))).toBe(true);
  });

  it('keeps taken priorities visible but not selectable', async () => {
    await create({ title: 'Gym', priority: 10 });
    await renderApp(service, `/task/new?date=${TODAY}`);

    const taken = await screen.findByTestId('priority-option-10');
    await fireEvent.press(taken);

    expect(taken).toBeDisabled();
    expect(screen.getByLabelText('Priority 10, taken by Gym')).toBeTruthy();
    expect(screen.getByTestId('priority-option-10')).not.toBeSelected();
  });

  it('requires a priority for a scheduled task', async () => {
    await renderApp(service, `/task/new?date=${TODAY}`);
    await screen.findByTestId('task-editor');

    await fireEvent.changeText(screen.getByLabelText('Title'), 'No priority');
    await save();

    expect(await screen.findByText('Choose a priority from 1 to 10')).toBeTruthy();
    expect(await service.getDeck(TODAY)).toEqual([]);
  });

  it('creates a Future task without a date or priority', async () => {
    await renderApp(service, '/task/new?placement=future');
    await screen.findByTestId('task-editor');

    expect(screen.queryByTestId('priority-option-1')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Learn piano');
    await save();

    await waitFor(async () => expect(await service.getFuturePool()).toHaveLength(1));
    expect((await service.getFuturePool())[0]).toMatchObject({
      title: 'Learn piano',
      scheduledDate: null,
      placementType: null,
      priority: null,
      carryOverOrder: null,
    });
  });

  it('does not offer a reminder with a date for a Future task', async () => {
    await renderApp(service, '/task/new?placement=future');
    await screen.findByTestId('task-editor');

    expect(screen.queryByRole('radio', { name: 'At a date and time' })).toBeNull();
    expect(screen.queryByLabelText('Reminder date')).toBeNull();
    expect(screen.queryByLabelText('Reminder time')).toBeNull();
    expect(screen.getByRole('radio', { name: 'No reminder' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'At a time of day' })).toBeTruthy();
  });

  it('hides the dated reminder fields when a day task is switched to Future', async () => {
    await renderApp(service, `/task/new?date=${TODAY}`);
    await screen.findByTestId('task-editor');

    await fireEvent.press(screen.getByRole('radio', { name: 'At a date and time' }));
    expect(screen.getByLabelText('Reminder date')).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'Future' }));

    expect(screen.queryByRole('radio', { name: 'At a date and time' })).toBeNull();
    expect(screen.queryByLabelText('Reminder date')).toBeNull();
    expect(screen.getByRole('radio', { name: 'No reminder' })).toBeSelected();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Someday');
    await save();

    await waitFor(async () => expect(await service.getFuturePool()).toHaveLength(1));
    expect((await service.getFuturePool())[0]?.reminder).toBeNull();
  });

  it('loads the current values of an existing task', async () => {
    const task = await create({
      title: 'Dentist',
      description: 'Checkup',
      exactTime: '07:30',
      durationMinutes: 45,
      address: 'Main St 1',
      travelMinutes: 10,
      thingsToTake: [{ text: 'Insurance card' }],
      reminder: { type: 'dayPeriod', period: 'evening' },
    });

    await openEditor(task.id);

    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Dentist');
    expect(screen.getByLabelText('Description')).toHaveDisplayValue('Checkup');
    expect(pickerDateToLocalTime(screen.getByLabelText('Exact time').props.value)).toBe('07:30');
    expect(screen.getByLabelText('Duration (min)')).toHaveDisplayValue('45');
    expect(screen.getByLabelText('Address')).toHaveDisplayValue('Main St 1');
    expect(screen.getByLabelText('Travel time (min)')).toHaveDisplayValue('10');
    expect(screen.getByLabelText('Item 1')).toHaveDisplayValue('Insurance card');
    expect(screen.getByRole('radio', { name: 'At a time of day' })).toBeSelected();
    expect(await screen.findByTestId('priority-option-5')).toBeSelected();
  });

  it('keeps the current priority of the edited task available', async () => {
    const task = await create({ priority: 5 });
    await create({ title: 'Other', priority: 8 });

    await openEditor(task.id);

    const own = await screen.findByTestId('priority-option-5');
    expect(own).toBeEnabled();
    expect(own).toBeSelected();
    expect(screen.getByTestId('priority-option-8')).toBeDisabled();
  });

  it('saves nothing when the chosen priority is taken while editing', async () => {
    const task = await create({ title: 'Original', priority: 5 });
    await openEditor(task.id);

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Changed');
    await fireEvent.press(screen.getByRole('button', { name: 'Next day' }));
    await fireEvent.press(await screen.findByTestId('priority-option-9'));
    await create({ title: 'Taken', scheduledDate: TOMORROW, priority: 9 });
    await save();

    expect(await screen.findByText(/already taken by "Taken"/)).toBeTruthy();
    expect(unwrap(await service.getTask(task.id))).toEqual(task);
    await waitFor(() => expect(screen.getByTestId('priority-option-9')).toBeDisabled());
  });

  it('clears the day period when an exact time is chosen', async () => {
    const task = await create({ dayPeriod: 'morning' });
    await openEditor(task.id);

    await fireEvent.press(screen.getByRole('radio', { name: 'Exact time' }));
    await pickDateTime('Exact time', new Date(2026, 8, 11, 9, 15));
    await save();

    await waitFor(async () =>
      expect(unwrap(await service.getTask(task.id))).toMatchObject({
        exactTime: '09:15',
        dayPeriod: null,
      }),
    );
  });

  it('clears the exact time when a day period is chosen', async () => {
    const task = await create({ exactTime: '07:30' });
    await openEditor(task.id);

    await fireEvent.press(screen.getByRole('radio', { name: 'Time of day' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Evening' }));

    expect(screen.queryByLabelText('Exact time')).toBeNull();
    await save();

    await waitFor(async () =>
      expect(unwrap(await service.getTask(task.id))).toMatchObject({
        exactTime: null,
        dayPeriod: 'evening',
      }),
    );
  });

  it('does not save empty things to take', async () => {
    const task = await create();
    await openEditor(task.id);

    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
    await fireEvent.changeText(screen.getByLabelText('Item 1'), 'Passport');
    await fireEvent.changeText(screen.getByLabelText('Item 3'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove item 1' }));
    await fireEvent.changeText(screen.getByLabelText('Item 1'), 'Charger');
    await save();

    await waitFor(async () =>
      expect(unwrap(await service.getTask(task.id)).thingsToTake).toEqual([
        { text: 'Charger', checked: false },
      ]),
    );
  });

  it('asks for confirmation before deleting', async () => {
    const alert = mockAlert();
    const task = await create();
    await openEditor(task.id);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete task' }));

    expect(alert).toHaveBeenCalledWith('Delete task?', expect.any(String), expect.any(Array));
    await pressAlertButton(alert, 'Cancel');
    expect(unwrap(await service.getTask(task.id))).toEqual(task);
  });

  it('frees the priority after the task is deleted and discards unsaved edits', async () => {
    const alert = mockAlert();
    const task = await create({ priority: 5 });
    await openEditor(task.id);

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Unsaved');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete task' }));
    await pressAlertButton(alert, 'Delete');

    await waitFor(async () => expect(await service.getTask(task.id)).toMatchObject({ ok: false }));
    expect((await service.getPriorityAvailability(TODAY))[5]).toEqual({
      priority: 5,
      occupiedBy: null,
    });
    expect(await service.getDeck(TODAY)).toEqual([]);
  });

  it('keeps the task and its reminder when moving to Future is cancelled', async () => {
    const alert = mockAlert();
    const task = await create({ reminder: { type: 'dayPeriod', period: 'evening' } });
    await openEditor(task.id);

    await fireEvent.press(screen.getByRole('radio', { name: 'Future' }));
    await save();

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Move to Future?', expect.any(String), expect.any(Array)),
    );
    await pressAlertButton(alert, 'Cancel');

    expect(unwrap(await service.getTask(task.id))).toEqual(task);
    expect(screen.getByTestId('task-editor')).toBeTruthy();
  });

  it('asks before turning off a reminder when moving a task to Future', async () => {
    const alert = mockAlert();
    const task = await create({ reminder: { type: 'exact', localDateTime: '2026-09-11T18:00' } });
    await openEditor(task.id);

    await fireEvent.press(screen.getByRole('radio', { name: 'Future' }));
    await save();

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Move to Future?', expect.any(String), expect.any(Array)),
    );
    expect(unwrap(await service.getTask(task.id))).toEqual(task);

    await pressAlertButton(alert, 'Turn off and move');

    await waitFor(async () =>
      expect(unwrap(await service.getTask(task.id))).toMatchObject({
        scheduledDate: null,
        priority: null,
        reminder: null,
      }),
    );
  });

  describe('Mega Crush tasks', () => {
    async function createMegaCrush() {
      const task = await create({ title: 'Carried' });
      return unwrap(await service.postponeUntilTomorrow(task.id)).task;
    }

    it('shows "Mega Crush" but not "Match made in heaven"', async () => {
      const task = await createMegaCrush();
      await openEditor(task.id);

      const editor = within(screen.getByTestId('task-editor'));
      expect(editor.getByText('Mega Crush')).toBeTruthy();
      expect(editor.queryByText('Match made in heaven')).toBeNull();
    });

    it('stays a carry-over task after a regular edit', async () => {
      const task = await createMegaCrush();
      await openEditor(task.id);

      await fireEvent.changeText(screen.getByLabelText('Title'), 'Renamed');
      await save();

      await waitFor(async () =>
        expect(unwrap(await service.getTask(task.id))).toMatchObject({
          title: 'Renamed',
          placementType: 'carryOver',
          priority: null,
          carryOverOrder: task.carryOverOrder,
        }),
      );
    });

    it('becomes a ranked task when a priority is chosen', async () => {
      const task = await createMegaCrush();
      await openEditor(task.id);

      await fireEvent.press(await screen.findByTestId('priority-option-4'));
      await save();

      await waitFor(async () =>
        expect(unwrap(await service.getTask(task.id))).toMatchObject({
          scheduledDate: TOMORROW,
          placementType: 'ranked',
          priority: 4,
          carryOverOrder: null,
        }),
      );
    });
  });
});
