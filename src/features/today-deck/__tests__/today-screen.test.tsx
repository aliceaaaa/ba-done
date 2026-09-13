import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import type { CreateTaskInput, RankedTask, TaskService } from '@/entities/task';
import { RETURN_NOTICE_MS } from '@/features/today-deck/model/use-return-notices';
import {
  TODAY,
  TOMORROW,
  YESTERDAY,
  createTestDatabase,
  createTestService,
  renderApp,
  unwrap,
} from '@/test-utils/test-app';

function cardIds(): string[] {
  return screen
    .queryAllByTestId(/^task-card-/)
    .map((element) => String(element.props.testID).slice('task-card-'.length));
}

async function swipe(taskId: string, translationX: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`swipe-${taskId}`), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: translationX / 4 },
      { translationX },
      { state: State.END, translationX },
    ]);
  });
}

function withPendingActions(service: TaskService): TaskService {
  const pending = () => new Promise<never>(() => undefined);
  return { ...service, completeTask: pending, postponeUntilTomorrow: pending };
}

describe('Your matches', () => {
  let db: NodeSqliteDatabase;
  let service: TaskService;

  async function create(
    input: Partial<CreateTaskInput> = {},
    target: TaskService = service,
  ): Promise<RankedTask> {
    return unwrap(
      await target.createTask({ title: 'Task', scheduledDate: TODAY, priority: 5, ...input }),
    );
  }

  async function carryIntoToday(...titles: string[]): Promise<RankedTask[]> {
    const yesterday = createTestService(db, { start: '2026-09-10T08:00:00.000Z', idPrefix: 'y' });
    const tasks: RankedTask[] = [];
    for (const [index, title] of titles.entries()) {
      tasks.push(
        await create({ title, scheduledDate: YESTERDAY, priority: 10 - index }, yesterday),
      );
    }
    for (const task of [...tasks].reverse()) {
      unwrap(await yesterday.postponeUntilTomorrow(task.id));
    }
    return tasks;
  }

  async function showToday(target: TaskService = service, expectedIds: string[] = []) {
    await renderApp(target);
    await screen.findByText('Your matches');
    if (expectedIds.length === 0) {
      await screen.findByTestId('empty-deck');
    } else {
      await waitFor(() => expect(cardIds()).toEqual(expectedIds));
    }
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    service = createTestService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('shows the "Your matches" title and a neutral empty state', async () => {
    await showToday();

    expect(screen.getByRole('header', { name: 'Your matches' })).toBeTruthy();
    expect(screen.getByText('No tasks for this day')).toBeTruthy();
  });

  it('puts carry-over tasks above ranked tasks and ranks the rest from 10 to 1', async () => {
    const low = await create({ title: 'Low', priority: 3 });
    const high = await create({ title: 'High', priority: 10 });
    const mid = await create({ title: 'Mid', priority: 7 });
    const [first, second] = await carryIntoToday('First carried', 'Second carried');

    await showToday(service, [first?.id ?? '', second?.id ?? '', high.id, mid.id, low.id]);
  });

  it('keeps the relative order of several carry-over tasks', async () => {
    const [a, b, c] = await carryIntoToday('A', 'B', 'C');

    await showToday(service, [a?.id ?? '', b?.id ?? '', c?.id ?? '']);
  });

  it('labels a returned task with "Mega Crush" and "Match made in heaven"', async () => {
    const [carried] = await carryIntoToday('Returned');
    const ranked = await create({ title: 'Regular', priority: 9 });

    await showToday(service, [carried?.id ?? '', ranked.id]);

    const carriedCard = within(screen.getByTestId(`task-card-${carried?.id ?? ''}`));
    const rankedCard = within(screen.getByTestId(`task-card-${ranked.id}`));
    expect(carriedCard.getByText('Mega Crush')).toBeTruthy();
    expect(carriedCard.getByText('Match made in heaven')).toBeTruthy();
    expect(rankedCard.queryByText('Mega Crush')).toBeNull();
    expect(rankedCard.getByLabelText('Priority 9')).toBeTruthy();
  });

  it('shows "Match made in heaven" only once for a task and day, even after a restart', async () => {
    const [carried] = await carryIntoToday('Returned');
    const carriedId = carried?.id ?? '';

    await showToday(service, [carriedId]);
    const firstCard = within(screen.getByTestId(`task-card-${carriedId}`));
    expect(await firstCard.findByText('Match made in heaven')).toBeTruthy();
    screen.unmount();

    await showToday(createTestService(db, { idPrefix: 'restart' }), [carriedId]);
    const secondCard = within(screen.getByTestId(`task-card-${carriedId}`));
    expect(secondCard.getByText('Mega Crush')).toBeTruthy();
    expect(secondCard.queryByText('Match made in heaven')).toBeNull();
  });

  it('keeps "Mega Crush" visible after "Match made in heaven" disappears', async () => {
    const [carried] = await carryIntoToday('Returned');
    const carriedId = carried?.id ?? '';
    await showToday(service, [carriedId]);
    const card = within(screen.getByTestId(`task-card-${carriedId}`));
    expect(await card.findByText('Match made in heaven')).toBeTruthy();

    await waitFor(() => expect(card.queryByText('Match made in heaven')).toBeNull(), {
      timeout: RETURN_NOTICE_MS + 2000,
    });

    expect(card.getByText('Mega Crush')).toBeTruthy();
  }, 15000);

  it('shows the exact time or the day period only when they are set', async () => {
    const exact = await create({ title: 'Exact', priority: 9, exactTime: '07:30' });
    const period = await create({ title: 'Period', priority: 8, dayPeriod: 'evening' });
    const plain = await create({ title: 'Plain', priority: 7 });

    await showToday(service, [exact.id, period.id, plain.id]);

    expect(within(screen.getByTestId(`task-card-${exact.id}`)).getByText('07:30')).toBeTruthy();
    expect(within(screen.getByTestId(`task-card-${period.id}`)).getByText('Evening')).toBeTruthy();
    expect(within(screen.getByTestId(`task-card-${plain.id}`)).queryByText(/\d\d:\d\d/)).toBeNull();
  });

  it('shows "Done" while a card is swiped right', async () => {
    const task = await create({ title: 'Gym' });
    await showToday(withPendingActions(service), [task.id]);

    await swipe(task.id, 200);

    expect(
      await within(screen.getByTestId(`task-card-${task.id}`)).findByText('Done'),
    ).toBeTruthy();
  });

  it('completes a task with a right swipe and restores it with Undo', async () => {
    const task = await create({ title: 'Gym' });
    await showToday(service, [task.id]);

    await swipe(task.id, 200);

    await waitFor(() => expect(cardIds()).toEqual([]));
    const completed = unwrap(await service.getTask(task.id));
    expect(completed).toMatchObject({ status: 'completed' });
    expect(completed.completedAt).not.toBeNull();
    expect((await service.getHistory(task.id)).map((event) => event.type)).toEqual(['completed']);
    expect(within(screen.getByTestId('undo-bar')).getByText('Done: Gym')).toBeTruthy();

    await fireEvent.press(within(screen.getByTestId('undo-bar')).getByText('Undo'));

    await waitFor(() => expect(cardIds()).toEqual([task.id]));
    expect(unwrap(await service.getTask(task.id))).toEqual(task);
    expect(await service.getHistory(task.id)).toEqual([]);
  });

  it('shows "Not tonight" and moves the card to the end of the deck while swiping left', async () => {
    const first = await create({ title: 'First', priority: 10 });
    const second = await create({ title: 'Second', priority: 5 });
    await showToday(withPendingActions(service), [first.id, second.id]);

    await swipe(first.id, -200);

    await waitFor(() => expect(cardIds()).toEqual([second.id, first.id]));
    expect(
      await within(screen.getByTestId(`task-card-${first.id}`)).findByText('Not tonight'),
    ).toBeTruthy();
  });

  it('moves a task to the next local day as a carry-over without a ranked priority', async () => {
    const losAngeles = createTestService(db, {
      start: '2026-09-11T05:30:00.000Z',
      timeZone: 'America/Los_Angeles',
      idPrefix: 'la',
    });
    const task = await create({ title: 'Late', scheduledDate: YESTERDAY, priority: 6 }, losAngeles);
    await showToday(losAngeles, [task.id]);

    await swipe(task.id, -200);

    await waitFor(() => expect(cardIds()).toEqual([]));
    expect(unwrap(await service.getTask(task.id))).toMatchObject({
      status: 'active',
      scheduledDate: TODAY,
      placementType: 'carryOver',
      priority: null,
      carryOverOrder: 1,
    });
    expect(await service.getHistory(task.id)).toMatchObject([
      { type: 'postponed', fromDate: YESTERDAY, toDate: TODAY },
    ]);
  });

  it('does not run into ranked priority conflicts on the next day', async () => {
    const busy = await create({ title: 'Busy', scheduledDate: TOMORROW, priority: 5 });
    const task = await create({ title: 'Movable', priority: 5 });
    await showToday(service, [task.id]);

    await swipe(task.id, -200);

    await waitFor(() => expect(cardIds()).toEqual([]));
    expect((await service.getDeck(TOMORROW)).map((item) => item.id)).toEqual([task.id, busy.id]);
    expect(within(screen.getByTestId('undo-bar')).getByText('Not tonight: Movable')).toBeTruthy();
  });

  it('moves a Mega Crush task one more day when swiped left again', async () => {
    const task = await create({ title: 'Again' });
    unwrap(await service.postponeUntilTomorrow(task.id));
    await showToday();

    await fireEvent.press(screen.getByRole('button', { name: 'Next day' }));
    await waitFor(() => expect(cardIds()).toEqual([task.id]));
    await swipe(task.id, -200);

    await waitFor(() => expect(cardIds()).toEqual([]));
    expect(unwrap(await service.getTask(task.id))).toMatchObject({
      scheduledDate: '2026-09-13',
      placementType: 'carryOver',
      priority: null,
    });
  });

  it('restores date, placement, position and history with Undo after Not tonight', async () => {
    const first = await create({ title: 'First', priority: 10 });
    const second = await create({ title: 'Second', priority: 5 });
    await showToday(service, [first.id, second.id]);

    await swipe(first.id, -200);
    await waitFor(() => expect(cardIds()).toEqual([second.id]));
    await fireEvent.press(within(screen.getByTestId('undo-bar')).getByText('Undo'));

    await waitFor(() => expect(cardIds()).toEqual([first.id, second.id]));
    expect(unwrap(await service.getTask(first.id))).toEqual(first);
    expect(await service.getHistory(first.id)).toEqual([]);
    expect(await service.getDeck(TOMORROW)).toEqual([]);
  });

  it('opens the Future pool from the header', async () => {
    await showToday();

    await fireEvent.press(screen.getByRole('button', { name: 'Future' }));

    expect(await screen.findByTestId('empty-future-pool')).toBeTruthy();
  });
});
