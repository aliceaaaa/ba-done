import type { SqlDatabase, SqlExecutor } from '@/database/sql-database';
import type { NodeSqliteDatabase } from '@/database/testing/node-sqlite-database';
import {
  createTestDatabase,
  createTestListService,
  createTestService,
  unwrap,
} from '@/test-utils/test-app';

import type { ListError } from '../model/list-errors';
import type { ListResult, ListService } from '../model/list-service';
import type { List } from '../model/types';

function unwrapError<T>(result: ListResult<T>): ListError {
  if (result.ok) {
    throw new Error('Expected a failure result');
  }
  return result.error;
}

function titles(items: { title: string }[]): string[] {
  return items.map((item) => item.title);
}

function failingOnUpdate(db: SqlDatabase, failAt: number): SqlDatabase {
  function wrap(executor: SqlExecutor, counter: { updates: number }): SqlExecutor {
    return {
      ...executor,
      async run(sql, params) {
        if (sql.trimStart().startsWith('UPDATE list_items')) {
          counter.updates += 1;
          if (counter.updates === failAt) {
            throw new Error('disk I/O error');
          }
        }
        return executor.run(sql, params);
      },
    };
  }
  return {
    ...db,
    transaction(work) {
      const counter = { updates: 0 };
      return db.transaction((tx) => work(wrap(tx, counter)));
    },
  };
}

describe('ListService', () => {
  let db: NodeSqliteDatabase;
  let service: ListService;

  async function shopping(): Promise<List> {
    const [first] = await service.getLists();
    if (first === undefined) {
      throw new Error('Shopping list was not created');
    }
    return first;
  }

  beforeEach(async () => {
    db = await createTestDatabase();
    service = createTestListService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('lists', () => {
    it('lazily creates a single Shopping list on first access', async () => {
      expect(await db.all('SELECT id FROM lists')).toEqual([]);

      const [first] = await service.getLists();
      await service.getLists();
      await service.getArchivedLists();

      expect(first).toMatchObject({
        title: 'Shopping',
        kind: 'shopping',
        color: 'green',
        icon: 'cart',
        archivedAt: null,
        deletedAt: null,
        activeItemCount: 0,
      });
      expect(await db.all('SELECT title FROM lists')).toEqual([{ title: 'Shopping' }]);
    });

    it('creates custom lists and keeps Shopping first', async () => {
      const pharmacy = unwrap(
        await service.createList({ title: '  Pharmacy ', icon: 'pill', color: 'pink' }),
      );
      const trip = unwrap(await service.createList({ title: 'Trip' }));

      expect(pharmacy).toMatchObject({ title: 'Pharmacy', kind: 'custom', icon: 'pill' });
      expect(trip).toMatchObject({ kind: 'custom', color: 'blue', icon: 'checklist' });
      expect(titles(await service.getLists())).toEqual(['Shopping', 'Pharmacy', 'Trip']);
    });

    it('requires a list title and a known color', async () => {
      const error = unwrapError(await service.createList({ title: '   ' }));
      expect(error).toMatchObject({
        type: 'ValidationError',
        issues: [{ field: 'title', message: 'Title is required' }],
      });

      const badColor = unwrapError(
        await service.createList({ title: 'Trip', color: 'teal' as unknown as 'blue' }),
      );
      expect(badColor).toMatchObject({ issues: [{ field: 'color' }] });
    });

    it('renames a list and rejects an empty title', async () => {
      const list = unwrap(await service.createList({ title: 'Trip' }));

      const renamed = unwrap(await service.updateList(list.id, { title: 'Summer trip' }));
      const empty = unwrapError(await service.updateList(list.id, { title: '' }));

      expect(renamed.title).toBe('Summer trip');
      expect(empty.type).toBe('ValidationError');
      expect(unwrap(await service.getList(list.id)).title).toBe('Summer trip');
    });

    it('archives and restores a list', async () => {
      const list = unwrap(await service.createList({ title: 'Trip' }));
      unwrap(await service.addItem(list.id, { title: 'Passport' }));

      const archived = unwrap(await service.archiveList(list.id));

      expect(archived.archivedAt).not.toBeNull();
      expect(titles(await service.getLists())).toEqual(['Shopping']);
      expect(await service.getArchivedLists()).toEqual([
        expect.objectContaining({ title: 'Trip', activeItemCount: 1 }),
      ]);
      expect(unwrapError(await service.addItem(list.id, { title: 'Tickets' })).type).toBe(
        'ListArchived',
      );

      const restored = unwrap(await service.restoreList(list.id));

      expect(restored.archivedAt).toBeNull();
      expect(titles(await service.getLists())).toEqual(['Shopping', 'Trip']);
      expect(await service.getArchivedLists()).toEqual([]);
    });

    it('does not delete Shopping while it is the only shopping list', async () => {
      const list = await shopping();

      expect(unwrapError(await service.deleteList(list.id))).toMatchObject({
        type: 'ShoppingListRequired',
      });

      const groceries = unwrap(await service.createList({ title: 'Groceries', kind: 'shopping' }));
      unwrap(await service.deleteList(list.id));

      expect(titles(await service.getLists())).toEqual(['Groceries']);
      expect(unwrapError(await service.deleteList(groceries.id)).type).toBe('ShoppingListRequired');
    });

    it('soft deletes a list and hides it everywhere', async () => {
      const list = unwrap(await service.createList({ title: 'Trip' }));
      const archived = unwrap(await service.createList({ title: 'Old' }));
      unwrap(await service.archiveList(archived.id));

      unwrap(await service.deleteList(list.id));
      unwrap(await service.deleteList(archived.id));

      expect(titles(await service.getLists())).toEqual(['Shopping']);
      expect(await service.getArchivedLists()).toEqual([]);
      expect(unwrapError(await service.getList(list.id)).type).toBe('ListNotFound');
      expect(
        await db.get('SELECT deleted_at IS NOT NULL AS deleted FROM lists WHERE id = ?', [list.id]),
      ).toEqual({ deleted: 1 });
    });
  });

  describe('items', () => {
    it('adds items to the end of the active items and allows duplicates', async () => {
      const list = await shopping();

      unwrap(await service.addItem(list.id, { title: 'Milk' }));
      unwrap(await service.addItem(list.id, { title: 'Bread' }));
      const duplicate = unwrap(await service.addItem(list.id, { title: 'Milk' }));

      const items = unwrap(await service.getItems(list.id));
      expect(titles(items.active)).toEqual(['Milk', 'Bread', 'Milk']);
      expect(items.active.map((item) => item.position)).toEqual([1, 2, 3]);
      expect(duplicate).toMatchObject({ checked: false, checkedAt: null, position: 3 });
      expect((await service.getLists())[0]?.activeItemCount).toBe(3);
    });

    it('stores quantity, unit and note and rejects invalid values', async () => {
      const list = await shopping();

      const water = unwrap(
        await service.addItem(list.id, {
          title: ' Water ',
          quantity: 2,
          unit: ' bottles ',
          note: '  ',
        }),
      );
      const invalid = unwrapError(await service.addItem(list.id, { title: 'Tea', quantity: 0 }));
      const untitled = unwrapError(await service.addItem(list.id, { title: ' ' }));

      expect(water).toMatchObject({ title: 'Water', quantity: 2, unit: 'bottles', note: null });
      expect(invalid).toMatchObject({ issues: [{ field: 'quantity' }] });
      expect(untitled).toMatchObject({ issues: [{ field: 'title' }] });
      expect(Object.keys(water)).not.toEqual(
        expect.arrayContaining(['priority', 'reminder', 'scheduledDate', 'placementType']),
      );
    });

    it('checks and unchecks items, keeping active items above completed ones', async () => {
      const list = await shopping();
      const milk = unwrap(await service.addItem(list.id, { title: 'Milk' }));
      unwrap(await service.addItem(list.id, { title: 'Bread' }));
      unwrap(await service.addItem(list.id, { title: 'Eggs' }));

      const checked = unwrap(await service.setItemChecked(milk.id, true));
      let items = unwrap(await service.getItems(list.id));

      expect(checked).toMatchObject({ checked: true, checkedAt: expect.any(String) });
      expect(titles(items.active)).toEqual(['Bread', 'Eggs']);
      expect(items.active.map((item) => item.position)).toEqual([1, 2]);
      expect(titles(items.completed)).toEqual(['Milk']);

      const reopened = unwrap(await service.setItemChecked(milk.id, false));
      items = unwrap(await service.getItems(list.id));

      expect(reopened).toMatchObject({ checked: false, checkedAt: null, position: 3 });
      expect(titles(items.active)).toEqual(['Bread', 'Eggs', 'Milk']);
      expect(items.completed).toEqual([]);
    });

    it('edits an item', async () => {
      const list = await shopping();
      const item = unwrap(await service.addItem(list.id, { title: 'Milk', quantity: 1 }));

      const edited = unwrap(
        await service.updateItem(item.id, { title: 'Oat milk', unit: 'l', note: 'Barista' }),
      );
      const cleared = unwrap(await service.updateItem(item.id, { quantity: null }));

      expect(edited).toMatchObject({ title: 'Oat milk', quantity: 1, unit: 'l', note: 'Barista' });
      expect(cleared).toMatchObject({ title: 'Oat milk', quantity: null, unit: 'l' });
      expect(unwrapError(await service.updateItem('missing', { title: 'X' })).type).toBe(
        'ListItemNotFound',
      );
    });

    it('soft deletes items and compacts active positions', async () => {
      const list = await shopping();
      unwrap(await service.addItem(list.id, { title: 'Milk' }));
      const bread = unwrap(await service.addItem(list.id, { title: 'Bread' }));
      unwrap(await service.addItem(list.id, { title: 'Eggs' }));

      unwrap(await service.deleteItem(bread.id));

      const items = unwrap(await service.getItems(list.id));
      expect(titles(items.active)).toEqual(['Milk', 'Eggs']);
      expect(items.active.map((item) => item.position)).toEqual([1, 2]);
      expect(unwrapError(await service.getItem(bread.id)).type).toBe('ListItemNotFound');
      expect(
        await db.get('SELECT deleted_at IS NOT NULL AS deleted FROM list_items WHERE id = ?', [
          bread.id,
        ]),
      ).toEqual({ deleted: 1 });
    });

    it('clears completed items only', async () => {
      const list = await shopping();
      const milk = unwrap(await service.addItem(list.id, { title: 'Milk' }));
      const bread = unwrap(await service.addItem(list.id, { title: 'Bread' }));
      unwrap(await service.addItem(list.id, { title: 'Eggs' }));
      unwrap(await service.setItemChecked(milk.id, true));
      unwrap(await service.setItemChecked(bread.id, true));

      expect(unwrap(await service.clearCompleted(list.id))).toEqual({ count: 2 });

      const items = unwrap(await service.getItems(list.id));
      expect(titles(items.active)).toEqual(['Eggs']);
      expect(items.completed).toEqual([]);
    });

    it('moves items up and down', async () => {
      const list = await shopping();
      const milk = unwrap(await service.addItem(list.id, { title: 'Milk' }));
      unwrap(await service.addItem(list.id, { title: 'Bread' }));
      const eggs = unwrap(await service.addItem(list.id, { title: 'Eggs' }));

      expect(titles(unwrap(await service.moveItem(eggs.id, 'up')))).toEqual([
        'Milk',
        'Eggs',
        'Bread',
      ]);
      expect(titles(unwrap(await service.moveItem(milk.id, 'down')))).toEqual([
        'Eggs',
        'Milk',
        'Bread',
      ]);
      expect(unwrapError(await service.moveItem(eggs.id, 'up')).type).toBe('ItemMoveNotAllowed');
      const items = unwrap(await service.getItems(list.id));
      expect(items.active.map((item) => item.position)).toEqual([1, 2, 3]);
    });

    it('rolls back every position change when a write fails in the middle', async () => {
      const list = await shopping();
      const milk = unwrap(await service.addItem(list.id, { title: 'Milk' }));
      unwrap(await service.addItem(list.id, { title: 'Bread' }));
      unwrap(await service.addItem(list.id, { title: 'Eggs' }));
      const failing = createTestListService(failingOnUpdate(db, 3), { idPrefix: 'failing' });

      await expect(failing.setItemChecked(milk.id, true)).rejects.toThrow('disk I/O error');

      const items = unwrap(await service.getItems(list.id));
      expect(titles(items.active)).toEqual(['Milk', 'Bread', 'Eggs']);
      expect(items.active.map((item) => item.position)).toEqual([1, 2, 3]);
      expect(items.completed).toEqual([]);

      const movingFailure = createTestListService(failingOnUpdate(db, 2), { idPrefix: 'moving' });
      await expect(movingFailure.moveItem(milk.id, 'down')).rejects.toThrow('disk I/O error');
      expect(titles(unwrap(await service.getItems(list.id)).active)).toEqual([
        'Milk',
        'Bread',
        'Eggs',
      ]);
    });

    it('creates a list together with its first item atomically', async () => {
      const created = unwrap(
        await service.createListWithItem({ title: 'Pharmacy' }, { title: 'Aspirin' }),
      );
      expect(created.list.title).toBe('Pharmacy');
      expect(created.item).toMatchObject({ listId: created.list.id, position: 1 });

      const failed = unwrapError(
        await service.createListWithItem({ title: 'Hardware' }, { title: '  ' }),
      );
      expect(failed.type).toBe('ValidationError');
      expect(titles(await service.getLists())).toEqual(['Shopping', 'Pharmacy']);
    });

    it('never creates tasks when list items change', async () => {
      const tasks = createTestService(db);
      const list = await shopping();
      const item = unwrap(await service.addItem(list.id, { title: 'Milk' }));
      unwrap(await service.updateItem(item.id, { title: 'Oat milk' }));
      unwrap(await service.setItemChecked(item.id, true));
      unwrap(await service.clearCompleted(list.id));

      expect(await db.all('SELECT id FROM tasks')).toEqual([]);
      expect(await tasks.getFuturePool()).toEqual([]);
    });

    it('notifies listeners after committed changes only', async () => {
      const listener = jest.fn();
      const list = await shopping();
      service.onChange(listener);

      unwrap(await service.addItem(list.id, { title: 'Milk' }));
      unwrapError(await service.addItem(list.id, { title: '' }));

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
