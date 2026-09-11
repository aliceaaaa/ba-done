import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import type { TaskService } from '@/entities/task';
import {
  TODAY,
  TOMORROW,
  createTestDatabase,
  createTestService,
  renderApp,
  unwrap,
} from '@/test-utils/test-app';

function poolIds(): string[] {
  return screen
    .queryAllByTestId(/^future-task-/)
    .map((element) => String(element.props.testID).slice('future-task-'.length));
}

describe('Future pool', () => {
  let db: NodeSqliteDatabase;
  let service: TaskService;

  beforeEach(async () => {
    db = await createTestDatabase();
    service = createTestService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('shows a neutral empty state and creates a Future task', async () => {
    await renderApp(service, '/future');
    expect(await screen.findByText('No tasks without a date')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'New Future task' }));
    await screen.findByTestId('task-editor');
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Learn piano');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Learn piano')).toBeTruthy();
    const [task] = await service.getFuturePool();
    expect(task).toMatchObject({ scheduledDate: null, priority: null, placementType: null });
  });

  it('lists Future tasks newest first and keeps them out of "Your matches"', async () => {
    const older = unwrap(await service.createFutureTask({ title: 'Older' }));
    const newer = unwrap(await service.createFutureTask({ title: 'Newer' }));

    await renderApp(service, '/future');

    await waitFor(() => expect(poolIds()).toEqual([newer.id, older.id]));
    expect(await service.getDeck(TODAY)).toEqual([]);
  });

  it('does not show Future tasks in "Your matches"', async () => {
    unwrap(await service.createFutureTask({ title: 'Someday' }));

    await renderApp(service);

    expect(await screen.findByTestId('empty-deck')).toBeTruthy();
    expect(screen.queryByText('Someday')).toBeNull();
  });

  it('schedules a task on a chosen day and offers to open that day', async () => {
    const task = unwrap(await service.createFutureTask({ title: 'Learn piano' }));
    unwrap(await service.createTask({ title: 'Busy', scheduledDate: TOMORROW, priority: 7 }));
    await renderApp(service, '/future');

    await fireEvent.press(await screen.findByRole('button', { name: 'Schedule Learn piano' }));
    const panel = within(screen.getByTestId(`schedule-panel-${task.id}`));
    await fireEvent.press(panel.getByRole('button', { name: 'Next day' }));
    await waitFor(() => expect(panel.getByTestId('priority-option-7')).toBeDisabled());
    await fireEvent.press(panel.getByTestId('priority-option-8'));
    await fireEvent.press(panel.getByRole('button', { name: 'Schedule' }));

    await waitFor(() => expect(poolIds()).toEqual([]));
    expect(
      within(screen.getByTestId('notice-bar')).getByText(/Scheduled for .*: Learn piano/),
    ).toBeTruthy();
    expect(unwrap(await service.getTask(task.id))).toMatchObject({
      scheduledDate: TOMORROW,
      placementType: 'ranked',
      priority: 8,
      carryOverOrder: null,
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Go to day' }));

    expect(await screen.findByTestId(`task-card-${task.id}`)).toBeTruthy();
  });

  it('opens the details and the editor of a Future task', async () => {
    const task = unwrap(await service.createFutureTask({ title: 'Learn piano' }));
    await renderApp(service, '/future');

    await fireEvent.press(await screen.findByTestId(`open-task-${task.id}`));
    await screen.findByTestId('task-details');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));

    expect(await screen.findByTestId('task-editor')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Future' })).toBeSelected();
  });
});
