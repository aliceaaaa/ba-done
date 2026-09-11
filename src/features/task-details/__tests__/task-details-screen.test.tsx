import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import type { TaskService } from '@/entities/task';
import {
  TODAY,
  createTestDatabase,
  createTestService,
  renderApp,
  unwrap,
} from '@/test-utils/test-app';

describe('Task details', () => {
  let db: NodeSqliteDatabase;
  let service: TaskService;

  beforeEach(async () => {
    db = await createTestDatabase();
    service = createTestService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('opens from a tap on a card and shows the description under "About"', async () => {
    const task = unwrap(
      await service.createTask({
        title: 'Dentist',
        description: 'Bring the insurance card',
        scheduledDate: TODAY,
        priority: 6,
        durationMinutes: 45,
      }),
    );
    await renderApp(service);

    await fireEvent.press(await screen.findByTestId(`open-task-${task.id}`));

    expect(await screen.findByTestId('task-details')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'About' })).toBeTruthy();
    expect(screen.getByText('Bring the insurance card')).toBeTruthy();
    expect(screen.getByText('45 min')).toBeTruthy();
    expect(screen.queryByText('Address')).toBeNull();
    expect(screen.queryByText('Reminder')).toBeNull();
  });

  it('stays read-only until "Edit" is pressed', async () => {
    const task = unwrap(
      await service.createTask({ title: 'Dentist', scheduledDate: TODAY, priority: 6 }),
    );
    await renderApp(service, `/task/${task.id}`);
    await screen.findByTestId('task-details');

    expect(screen.queryByTestId('task-editor')).toBeNull();
    expect(screen.queryByLabelText('Title')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));

    expect(await screen.findByTestId('task-editor')).toBeTruthy();
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Dentist');
  });

  it('lets the user check things to take', async () => {
    const task = unwrap(
      await service.createTask({
        title: 'Trip',
        scheduledDate: TODAY,
        priority: 6,
        thingsToTake: [{ text: 'Passport' }, { text: 'Charger' }],
      }),
    );
    await renderApp(service, `/task/${task.id}`);

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Passport' }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Passport' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Charger' })).not.toBeChecked();
    expect(unwrap(await service.getTask(task.id)).thingsToTake).toEqual([
      { text: 'Passport', checked: true },
      { text: 'Charger', checked: false },
    ]);
  });

  it('shows Future tasks without a date', async () => {
    const task = unwrap(await service.createFutureTask({ title: 'Learn piano' }));
    await renderApp(service, `/task/${task.id}`);

    await screen.findByTestId('task-details');

    expect(screen.getByText('Future')).toBeTruthy();
    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Priority')).toBeNull();
  });
});
