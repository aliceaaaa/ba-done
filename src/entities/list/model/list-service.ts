import type { SqlDatabase, SqlExecutor } from '@/database/sql-database';
import { err, ok, type Result } from '@/shared/lib/result';

import { createListItemRepository, type ListItemRepository } from '../api/list-item-repository';
import { createListRepository, type ListRepository } from '../api/list-repository';
import {
  itemMoveNotAllowed,
  listArchived,
  listItemNotFound,
  listNotFound,
  shoppingListRequired,
  type ListError,
} from './list-errors';
import { validateItemFields, validateListFields } from './list-validation';
import {
  DEFAULT_SHOPPING_LIST,
  type CreateListInput,
  type List,
  type ListItem,
  type ListItemInput,
  type ListItems,
  type ListSummary,
  type MoveDirection,
  type UpdateListInput,
  type UpdateListItemInput,
} from './types';

export type ListServiceDeps = {
  db: SqlDatabase;
  now: () => Date;
  generateId: () => string;
};

export type ListResult<T> = Result<T, ListError>;

export type ListWithItem = {
  list: List;
  item: ListItem;
};

export type ListService = {
  getLists(): Promise<ListSummary[]>;
  getArchivedLists(): Promise<ListSummary[]>;
  getList(id: string): Promise<ListResult<List>>;
  getItems(listId: string): Promise<ListResult<ListItems>>;
  getItem(id: string): Promise<ListResult<ListItem>>;
  createList(input: CreateListInput): Promise<ListResult<List>>;
  createListWithItem(list: CreateListInput, item: ListItemInput): Promise<ListResult<ListWithItem>>;
  updateList(id: string, input: UpdateListInput): Promise<ListResult<List>>;
  archiveList(id: string): Promise<ListResult<List>>;
  restoreList(id: string): Promise<ListResult<List>>;
  deleteList(id: string): Promise<ListResult<{ id: string }>>;
  addItem(listId: string, input: ListItemInput): Promise<ListResult<ListItem>>;
  updateItem(id: string, input: UpdateListItemInput): Promise<ListResult<ListItem>>;
  setItemChecked(id: string, checked: boolean): Promise<ListResult<ListItem>>;
  moveItem(id: string, direction: MoveDirection): Promise<ListResult<ListItem[]>>;
  deleteItem(id: string): Promise<ListResult<{ id: string; listId: string }>>;
  clearCompleted(listId: string): Promise<ListResult<{ count: number }>>;
  onChange(listener: () => void): () => void;
};

type Repositories = {
  lists: ListRepository;
  items: ListItemRepository;
};

class TransactionAborted extends Error {
  constructor(readonly listError: ListError) {
    super(listError.message);
    this.name = 'TransactionAborted';
  }
}

function createRepositories(db: SqlExecutor): Repositories {
  return { lists: createListRepository(db), items: createListItemRepository(db) };
}

async function compactAfter(
  items: ListItemRepository,
  listId: string,
  removedPosition: number,
  updatedAt: string,
): Promise<void> {
  const following = (await items.listActive(listId)).filter(
    (item) => item.position > removedPosition,
  );
  for (const item of following) {
    await items.setPosition(item.id, item.position - 1, updatedAt);
  }
}

export function createListService({ db, now, generateId }: ListServiceDeps): ListService {
  const listeners = new Set<() => void>();
  const timestamp = () => now().toISOString();

  function notifyChanged() {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  async function inTransaction<T>(
    work: (repos: Repositories) => Promise<ListResult<T>>,
    notify = true,
  ): Promise<ListResult<T>> {
    try {
      const committed = await db.transaction(async (tx) => {
        const result = await work(createRepositories(tx));
        if (!result.ok) {
          throw new TransactionAborted(result.error);
        }
        return result;
      });
      if (notify) {
        notifyChanged();
      }
      return committed;
    } catch (error) {
      if (error instanceof TransactionAborted) {
        return err(error.listError);
      }
      throw error;
    }
  }

  async function insertList(
    repos: Repositories,
    input: CreateListInput,
  ): Promise<ListResult<List>> {
    const validated = validateListFields({
      title: input.title,
      kind: input.kind ?? 'custom',
      color: input.color ?? (input.kind === 'shopping' ? DEFAULT_SHOPPING_LIST.color : 'blue'),
      icon: input.icon ?? (input.kind === 'shopping' ? DEFAULT_SHOPPING_LIST.icon : 'checklist'),
    });
    if (!validated.ok) {
      return validated;
    }
    const createdAt = timestamp();
    const list: List = {
      ...validated.value,
      id: generateId(),
      createdAt,
      updatedAt: createdAt,
      archivedAt: null,
      deletedAt: null,
    };
    await repos.lists.insert(list);
    return ok(list);
  }

  async function insertItem(
    repos: Repositories,
    list: List,
    input: ListItemInput,
  ): Promise<ListResult<ListItem>> {
    if (list.archivedAt !== null) {
      return err(listArchived(list.id));
    }
    const validated = validateItemFields({
      title: input.title,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
    });
    if (!validated.ok) {
      return validated;
    }
    const createdAt = timestamp();
    const item: ListItem = {
      ...validated.value,
      id: generateId(),
      listId: list.id,
      checked: false,
      position: await repos.items.nextActivePosition(list.id),
      createdAt,
      updatedAt: createdAt,
      checkedAt: null,
      deletedAt: null,
    };
    await repos.items.insert(item);
    return ok(item);
  }

  async function withList<T>(
    repos: Repositories,
    id: string,
    work: (list: List) => Promise<ListResult<T>>,
  ): Promise<ListResult<T>> {
    const list = await repos.lists.findById(id);
    return list === null ? err(listNotFound(id)) : work(list);
  }

  async function withEditableItem<T>(
    repos: Repositories,
    id: string,
    work: (item: ListItem, list: List) => Promise<ListResult<T>>,
  ): Promise<ListResult<T>> {
    const item = await repos.items.findById(id);
    if (item === null) {
      return err(listItemNotFound(id));
    }
    const list = await repos.lists.findById(item.listId);
    if (list === null) {
      return err(listItemNotFound(id));
    }
    if (list.archivedAt !== null) {
      return err(listArchived(list.id));
    }
    return work(item, list);
  }

  async function ensureShoppingList(): Promise<void> {
    const existing = await createListRepository(db).countShoppingLists();
    if (existing > 0) {
      return;
    }
    await inTransaction(async (repos) => {
      if ((await repos.lists.countShoppingLists()) > 0) {
        return ok(null);
      }
      return insertList(repos, DEFAULT_SHOPPING_LIST);
    }, false);
  }

  return {
    async getLists() {
      await ensureShoppingList();
      return createListRepository(db).listVisible();
    },

    async getArchivedLists() {
      await ensureShoppingList();
      return createListRepository(db).listArchived();
    },

    async getList(id) {
      const list = await createListRepository(db).findById(id);
      return list === null ? err(listNotFound(id)) : ok(list);
    },

    async getItems(listId) {
      const repos = createRepositories(db);
      const list = await repos.lists.findById(listId);
      if (list === null) {
        return err(listNotFound(listId));
      }
      const [active, completed] = await Promise.all([
        repos.items.listActive(listId),
        repos.items.listCompleted(listId),
      ]);
      return ok({ active, completed });
    },

    async getItem(id) {
      const repos = createRepositories(db);
      const item = await repos.items.findById(id);
      if (item === null || (await repos.lists.findById(item.listId)) === null) {
        return err(listItemNotFound(id));
      }
      return ok(item);
    },

    createList(input) {
      return inTransaction((repos) => insertList(repos, input));
    },

    createListWithItem(listInput, itemInput) {
      return inTransaction(async (repos) => {
        const list = await insertList(repos, listInput);
        if (!list.ok) {
          return list;
        }
        const item = await insertItem(repos, list.value, itemInput);
        return item.ok ? ok({ list: list.value, item: item.value }) : item;
      });
    },

    updateList(id, input) {
      return inTransaction((repos) =>
        withList(repos, id, async (list) => {
          const validated = validateListFields({
            title: input.title ?? list.title,
            kind: list.kind,
            color: input.color ?? list.color,
            icon: input.icon ?? list.icon,
          });
          if (!validated.ok) {
            return validated;
          }
          const updated: List = { ...list, ...validated.value, updatedAt: timestamp() };
          await repos.lists.update(updated);
          return ok(updated);
        }),
      );
    },

    archiveList(id) {
      return inTransaction((repos) =>
        withList(repos, id, async (list) => {
          if (list.archivedAt !== null) {
            return ok(list);
          }
          const archivedAt = timestamp();
          const archived: List = { ...list, archivedAt, updatedAt: archivedAt };
          await repos.lists.update(archived);
          return ok(archived);
        }),
      );
    },

    restoreList(id) {
      return inTransaction((repos) =>
        withList(repos, id, async (list) => {
          if (list.archivedAt === null) {
            return ok(list);
          }
          const restored: List = { ...list, archivedAt: null, updatedAt: timestamp() };
          await repos.lists.update(restored);
          return ok(restored);
        }),
      );
    },

    deleteList(id) {
      return inTransaction((repos) =>
        withList(repos, id, async (list) => {
          if (list.kind === 'shopping' && (await repos.lists.countShoppingLists()) <= 1) {
            return err(shoppingListRequired(list.id));
          }
          await repos.lists.softDelete(list.id, timestamp());
          return ok({ id: list.id });
        }),
      );
    },

    addItem(listId, input) {
      return inTransaction((repos) =>
        withList(repos, listId, (list) => insertItem(repos, list, input)),
      );
    },

    updateItem(id, input) {
      return inTransaction((repos) =>
        withEditableItem(repos, id, async (item) => {
          const validated = validateItemFields({
            title: input.title ?? item.title,
            quantity: input.quantity === undefined ? item.quantity : input.quantity,
            unit: input.unit === undefined ? item.unit : input.unit,
            note: input.note === undefined ? item.note : input.note,
          });
          if (!validated.ok) {
            return validated;
          }
          const updated: ListItem = { ...item, ...validated.value, updatedAt: timestamp() };
          await repos.items.update(updated);
          return ok(updated);
        }),
      );
    },

    setItemChecked(id, checked) {
      return inTransaction((repos) =>
        withEditableItem(repos, id, async (item) => {
          if (item.checked === checked) {
            return ok(item);
          }
          const updatedAt = timestamp();
          if (checked) {
            const done: ListItem = { ...item, checked: true, checkedAt: updatedAt, updatedAt };
            await repos.items.update(done);
            await compactAfter(repos.items, item.listId, item.position, updatedAt);
            return ok(done);
          }
          const reopened: ListItem = {
            ...item,
            checked: false,
            checkedAt: null,
            position: await repos.items.nextActivePosition(item.listId),
            updatedAt,
          };
          await repos.items.update(reopened);
          return ok(reopened);
        }),
      );
    },

    moveItem(id, direction) {
      return inTransaction((repos) =>
        withEditableItem(repos, id, async (item) => {
          const active = await repos.items.listActive(item.listId);
          const index = active.findIndex((candidate) => candidate.id === item.id);
          const neighbor = active[direction === 'up' ? index - 1 : index + 1];
          if (item.checked || index < 0 || neighbor === undefined) {
            return err(itemMoveNotAllowed(item.id));
          }
          const updatedAt = timestamp();
          const parking = await repos.items.nextActivePosition(item.listId);
          await repos.items.setPosition(item.id, parking, updatedAt);
          await repos.items.setPosition(neighbor.id, item.position, updatedAt);
          await repos.items.setPosition(item.id, neighbor.position, updatedAt);
          return ok(await repos.items.listActive(item.listId));
        }),
      );
    },

    deleteItem(id) {
      return inTransaction(async (repos) => {
        const item = await repos.items.findById(id);
        if (item === null) {
          return err(listItemNotFound(id));
        }
        const deletedAt = timestamp();
        await repos.items.softDelete(item.id, deletedAt);
        if (!item.checked) {
          await compactAfter(repos.items, item.listId, item.position, deletedAt);
        }
        return ok({ id: item.id, listId: item.listId });
      });
    },

    clearCompleted(listId) {
      return inTransaction((repos) =>
        withList(repos, listId, async (list) => {
          if (list.archivedAt !== null) {
            return err(listArchived(list.id));
          }
          const completed = await repos.items.listCompleted(list.id);
          const deletedAt = timestamp();
          for (const item of completed) {
            await repos.items.softDelete(item.id, deletedAt);
          }
          return ok({ count: completed.length });
        }),
      );
    },

    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
