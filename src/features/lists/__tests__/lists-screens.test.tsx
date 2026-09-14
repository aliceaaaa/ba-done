import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import type { SqlDatabase } from '@/database/sql-database';
import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import type { ListService } from '@/entities/list';
import type { TaskService } from '@/entities/task';
import {
  createTestDatabase,
  createTestListService,
  createTestService,
  mockAlert,
  pressAlertButton,
  renderApp,
  unwrap,
} from '@/test-utils/test-app';

import { LIST_TEXT } from '../ui/list-screen';

function failingWrites(db: SqlDatabase): SqlDatabase {
  return {
    ...db,
    transaction() {
      return Promise.reject(new Error('SQLITE_IOERR: disk I/O error'));
    },
  };
}

describe('Lists screens', () => {
  let db: NodeSqliteDatabase;
  let tasks: TaskService;
  let lists: ListService;

  beforeEach(async () => {
    db = await createTestDatabase();
    tasks = createTestService(db);
    lists = createTestListService(db);
  });

  afterEach(() => {
    db.close();
    jest.restoreAllMocks();
  });

  async function shoppingId(): Promise<string> {
    const [shopping] = await lists.getLists();
    return shopping?.id ?? '';
  }

  it('shows Shopping first with its color, icon and active item count', async () => {
    const trip = unwrap(await lists.createList({ title: 'Trip', icon: 'star', color: 'purple' }));
    unwrap(await lists.addItem(trip.id, { title: 'Passport' }));
    unwrap(await lists.addItem(trip.id, { title: 'Tickets' }));

    await renderApp(tasks, '/lists', undefined, undefined, { lists });

    const rows = await screen.findAllByTestId(/^list-row-/);
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Shopping, 0 items',
      'Trip, 2 items',
    ]);
    expect(screen.getByLabelText('Purple color')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archived lists' })).toBeTruthy();
  });

  it('shows an empty state with a create button when every list is archived', async () => {
    unwrap(await lists.archiveList(await shoppingId()));

    await renderApp(tasks, '/lists', undefined, undefined, { lists });

    expect(await screen.findByTestId('empty-lists')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Create list' }));
    await fireEvent.changeText(await screen.findByLabelText('Title'), 'Pharmacy');
    await fireEvent.press(screen.getByRole('radio', { name: 'Pharmacy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByTestId(/^list-screen-/)).toBeTruthy();
    expect((await lists.getLists()).map((list) => [list.title, list.icon])).toEqual([
      ['Pharmacy', 'pill'],
    ]);
  });

  it('adds items with the keyboard Done key and keeps the input ready for the next item', async () => {
    const id = await shoppingId();
    await renderApp(tasks, `/list/${id}`, undefined, undefined, { lists });
    const input = await screen.findByLabelText(LIST_TEXT.addPlaceholder);

    expect(input.props.submitBehavior).toBe('submit');
    expect(input.props.returnKeyType).toBe('done');
    await fireEvent.changeText(input, 'Milk');
    await fireEvent(input, 'submitEditing');
    await screen.findByRole('checkbox', { name: 'Milk' });
    expect(screen.getByLabelText(LIST_TEXT.addPlaceholder).props.value).toBe('');

    await fireEvent.changeText(screen.getByLabelText(LIST_TEXT.addPlaceholder), 'Milk');
    await fireEvent(screen.getByLabelText(LIST_TEXT.addPlaceholder), 'submitEditing');

    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: 'Milk' })).toHaveLength(2));
    expect(unwrap(await lists.getItems(id)).active.map((item) => item.title)).toEqual([
      'Milk',
      'Milk',
    ]);
  });

  it('checks items into a collapsible Completed section and clears them after confirmation', async () => {
    const id = await shoppingId();
    unwrap(await lists.addItem(id, { title: 'Milk' }));
    unwrap(await lists.addItem(id, { title: 'Bread' }));
    const alert = mockAlert();
    await renderApp(tasks, `/list/${id}`, undefined, undefined, { lists });

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Milk' }));

    const completed = await screen.findByTestId('completed-items');
    expect(
      within(completed).getByRole('checkbox', { name: 'Milk' }).props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });
    const toggle = screen.getByRole('button', { name: 'Completed, 1' });
    await fireEvent.press(toggle);
    expect(screen.queryByTestId('completed-items')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Completed, 1' }).props.accessibilityState,
    ).toMatchObject({
      expanded: false,
    });

    await fireEvent.press(screen.getByRole('button', { name: LIST_TEXT.clearCompleted }));
    expect(alert).toHaveBeenCalledWith(
      LIST_TEXT.clearTitle,
      LIST_TEXT.clearMessage,
      expect.any(Array),
    );
    expect(unwrap(await lists.getItems(id)).completed).toHaveLength(1);
    await pressAlertButton(alert, LIST_TEXT.clear);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Completed, 1' })).toBeNull());
    expect(unwrap(await lists.getItems(id)).completed).toEqual([]);
    expect(unwrap(await lists.getItems(id)).active.map((item) => item.title)).toEqual(['Bread']);
  });

  it('edits, moves and deletes items', async () => {
    const id = await shoppingId();
    const milk = unwrap(await lists.addItem(id, { title: 'Milk' }));
    unwrap(await lists.addItem(id, { title: 'Bread' }));
    const alert = mockAlert();
    await renderApp(tasks, `/list/${id}`, undefined, undefined, { lists });

    await fireEvent.press(await screen.findByRole('button', { name: 'Move Bread up' }));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('active-items'))
          .getAllByRole('checkbox')
          .map((box) => box.props.accessibilityLabel),
      ).toEqual(['Bread', 'Milk']),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Edit Milk' }));
    await screen.findByDisplayValue('Milk');
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Oat milk');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.changeText(screen.getByLabelText('Unit'), 'l');
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Barista edition');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('2 l')).toBeTruthy();
    expect(unwrap(await lists.getItem(milk.id))).toMatchObject({
      title: 'Oat milk',
      quantity: 2,
      unit: 'l',
      note: 'Barista edition',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Delete Bread' }));
    await pressAlertButton(alert, LIST_TEXT.delete);
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Bread' })).toBeNull());
  });

  it('shows an archived list read-only and restores it', async () => {
    const id = await shoppingId();
    unwrap(await lists.addItem(id, { title: 'Milk' }));
    unwrap(await lists.archiveList(id));
    await renderApp(tasks, `/list/${id}`, undefined, undefined, { lists });

    expect(await screen.findByText(LIST_TEXT.archived)).toBeTruthy();
    expect(screen.queryByLabelText(LIST_TEXT.addPlaceholder)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Milk' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });

    await fireEvent.press(screen.getByRole('button', { name: LIST_TEXT.restore }));

    expect(await screen.findByLabelText(LIST_TEXT.addPlaceholder)).toBeTruthy();
    expect(unwrap(await lists.getList(id)).archivedAt).toBeNull();
  });

  it('rolls back an optimistic check and keeps the typed item when SQLite fails', async () => {
    const id = await shoppingId();
    unwrap(await lists.addItem(id, { title: 'Milk' }));
    const broken = createTestListService(failingWrites(db), { idPrefix: 'broken' });
    await renderApp(tasks, `/list/${id}`, undefined, undefined, { lists: broken });

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Milk' }));

    expect(await screen.findByTestId('list-error')).toHaveTextContent(LIST_TEXT.saveFailed);
    expect(screen.getByRole('checkbox', { name: 'Milk' }).props.accessibilityState).toMatchObject({
      checked: false,
    });

    await fireEvent.changeText(screen.getByLabelText(LIST_TEXT.addPlaceholder), 'Bread');
    await fireEvent.press(screen.getByRole('button', { name: LIST_TEXT.add }));

    await waitFor(() =>
      expect(screen.getByTestId('list-error')).toHaveTextContent(LIST_TEXT.saveFailed),
    );
    expect(screen.getByLabelText(LIST_TEXT.addPlaceholder).props.value).toBe('Bread');
    expect(unwrap(await lists.getItems(id)).active.map((item) => item.title)).toEqual(['Milk']);
  });

  it('does not delete the only Shopping list', async () => {
    const id = await shoppingId();
    const alert = mockAlert();
    await renderApp(tasks, `/list/${id}/edit`, undefined, undefined, { lists });

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete list' }));
    await pressAlertButton(alert, 'Delete');

    expect(
      await screen.findByText('Shopping cannot be deleted while it is your only shopping list.'),
    ).toBeTruthy();
    await act(async () => undefined);
    expect((await lists.getLists()).map((list) => list.title)).toEqual(['Shopping']);
  });

  it('keeps long titles fully visible for large system fonts', async () => {
    const id = await shoppingId();
    const longTitle = `Organic oat milk ${'without added sugar '.repeat(8)}`.trim();
    unwrap(await lists.addItem(id, { title: longTitle }));
    await renderApp(tasks, `/list/${id}`, undefined, undefined, { lists });

    const title = await screen.findByText(longTitle);

    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.allowFontScaling).not.toBe(false);
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
  });
});
