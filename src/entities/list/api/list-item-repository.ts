import type { SqlExecutor, SqlValue } from '@/database/sql-database';

import type { ListItem } from '../model/types';

type ListItemRow = {
  id: string;
  list_id: string;
  title: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  checked: number;
  position: number;
  created_at: string;
  updated_at: string;
  checked_at: string | null;
  deleted_at: string | null;
};

const COLUMNS = [
  'id',
  'list_id',
  'title',
  'quantity',
  'unit',
  'note',
  'checked',
  'position',
  'created_at',
  'updated_at',
  'checked_at',
  'deleted_at',
] as const;

type Column = (typeof COLUMNS)[number];

const UPDATABLE_COLUMNS = COLUMNS.filter((column) => column !== 'id' && column !== 'list_id');
const SELECT_COLUMNS = COLUMNS.join(', ');
const INSERT_PLACEHOLDERS = COLUMNS.map(() => '?').join(', ');
const UPDATE_ASSIGNMENTS = UPDATABLE_COLUMNS.map((column) => `${column} = ?`).join(', ');

export type ListItemRepository = {
  findById(id: string): Promise<ListItem | null>;
  listActive(listId: string): Promise<ListItem[]>;
  listCompleted(listId: string): Promise<ListItem[]>;
  nextActivePosition(listId: string): Promise<number>;
  insert(item: ListItem): Promise<void>;
  update(item: ListItem): Promise<void>;
  setPosition(id: string, position: number, updatedAt: string): Promise<void>;
  softDelete(id: string, deletedAt: string): Promise<void>;
};

function toItem(row: ListItemRow): ListItem {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    quantity: row.quantity,
    unit: row.unit,
    note: row.note,
    checked: row.checked === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checkedAt: row.checked_at,
    deletedAt: row.deleted_at,
  };
}

function toValues(item: ListItem): Record<Column, SqlValue> {
  return {
    id: item.id,
    list_id: item.listId,
    title: item.title,
    quantity: item.quantity,
    unit: item.unit,
    note: item.note,
    checked: item.checked ? 1 : 0,
    position: item.position,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    checked_at: item.checkedAt,
    deleted_at: item.deletedAt,
  };
}

export function createListItemRepository(db: SqlExecutor): ListItemRepository {
  async function select(condition: string, params: readonly SqlValue[], order: string) {
    const rows = await db.all<ListItemRow>(
      `SELECT ${SELECT_COLUMNS} FROM list_items
       WHERE (${condition}) AND deleted_at IS NULL ${order}`,
      params,
    );
    return rows.map(toItem);
  }

  return {
    async findById(id) {
      const [item] = await select('id = ?', [id], '');
      return item ?? null;
    },

    listActive(listId) {
      return select('list_id = ? AND checked = 0', [listId], 'ORDER BY position ASC, id ASC');
    },

    listCompleted(listId) {
      return select(
        'list_id = ? AND checked = 1',
        [listId],
        'ORDER BY checked_at DESC, position ASC, id ASC',
      );
    },

    async nextActivePosition(listId) {
      const row = await db.get<{ position: number | null }>(
        `SELECT MAX(position) AS position FROM list_items
         WHERE list_id = ? AND checked = 0 AND deleted_at IS NULL`,
        [listId],
      );
      return (row?.position ?? 0) + 1;
    },

    async insert(item) {
      const values = toValues(item);
      await db.run(
        `INSERT INTO list_items (${SELECT_COLUMNS}) VALUES (${INSERT_PLACEHOLDERS})`,
        COLUMNS.map((column) => values[column]),
      );
    },

    async update(item) {
      const values = toValues(item);
      await db.run(
        `UPDATE list_items SET ${UPDATE_ASSIGNMENTS} WHERE id = ? AND deleted_at IS NULL`,
        [...UPDATABLE_COLUMNS.map((column) => values[column]), item.id],
      );
    },

    async setPosition(id, position, updatedAt) {
      await db.run(
        'UPDATE list_items SET position = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [position, updatedAt, id],
      );
    },

    async softDelete(id, deletedAt) {
      await db.run(
        'UPDATE list_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [deletedAt, deletedAt, id],
      );
    },
  };
}
