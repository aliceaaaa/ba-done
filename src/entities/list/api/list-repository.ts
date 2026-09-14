import type { SqlExecutor, SqlValue } from '@/database/sql-database';

import {
  LIST_COLORS,
  LIST_ICONS,
  LIST_KINDS,
  type List,
  type ListColor,
  type ListIcon,
  type ListKind,
  type ListSummary,
} from '../model/types';

type ListRow = {
  id: string;
  title: string;
  kind: string;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

type ListSummaryRow = ListRow & {
  active_item_count: number;
};

const COLUMNS = [
  'id',
  'title',
  'kind',
  'color',
  'icon',
  'created_at',
  'updated_at',
  'archived_at',
  'deleted_at',
] as const;

type Column = (typeof COLUMNS)[number];

const UPDATABLE_COLUMNS = COLUMNS.filter((column) => column !== 'id');
const SELECT_COLUMNS = COLUMNS.map((column) => `lists.${column}`).join(', ');
const INSERT_PLACEHOLDERS = COLUMNS.map(() => '?').join(', ');
const UPDATE_ASSIGNMENTS = UPDATABLE_COLUMNS.map((column) => `${column} = ?`).join(', ');
const LIST_ORDER = `ORDER BY CASE lists.kind WHEN 'shopping' THEN 0 ELSE 1 END,
  lists.created_at ASC, lists.id ASC`;

export type ListRepository = {
  findById(id: string): Promise<List | null>;
  listVisible(): Promise<ListSummary[]>;
  listArchived(): Promise<ListSummary[]>;
  countShoppingLists(): Promise<number>;
  insert(list: List): Promise<void>;
  update(list: List): Promise<void>;
  softDelete(id: string, deletedAt: string): Promise<void>;
};

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function toList(row: ListRow): List {
  if (!includes<ListKind>(LIST_KINDS, row.kind)) {
    throw new Error(`List ${row.id} has unknown kind "${row.kind}"`);
  }
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    color: includes<ListColor>(LIST_COLORS, row.color) ? row.color : 'gray',
    icon: includes<ListIcon>(LIST_ICONS, row.icon) ? row.icon : 'checklist',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

function toSummary(row: ListSummaryRow): ListSummary {
  return { ...toList(row), activeItemCount: row.active_item_count };
}

function toValues(list: List): Record<Column, SqlValue> {
  return {
    id: list.id,
    title: list.title,
    kind: list.kind,
    color: list.color,
    icon: list.icon,
    created_at: list.createdAt,
    updated_at: list.updatedAt,
    archived_at: list.archivedAt,
    deleted_at: list.deletedAt,
  };
}

export function createListRepository(db: SqlExecutor): ListRepository {
  async function selectSummaries(condition: string): Promise<ListSummary[]> {
    const rows = await db.all<ListSummaryRow>(
      `SELECT ${SELECT_COLUMNS},
         (SELECT COUNT(*) FROM list_items
          WHERE list_items.list_id = lists.id
            AND list_items.checked = 0 AND list_items.deleted_at IS NULL) AS active_item_count
       FROM lists
       WHERE (${condition}) AND lists.deleted_at IS NULL ${LIST_ORDER}`,
    );
    return rows.map(toSummary);
  }

  return {
    async findById(id) {
      const row = await db.get<ListRow>(
        `SELECT ${SELECT_COLUMNS} FROM lists WHERE lists.id = ? AND lists.deleted_at IS NULL`,
        [id],
      );
      return row === null ? null : toList(row);
    },

    listVisible() {
      return selectSummaries('lists.archived_at IS NULL');
    },

    listArchived() {
      return selectSummaries('lists.archived_at IS NOT NULL');
    },

    async countShoppingLists() {
      const row = await db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM lists WHERE kind = 'shopping' AND deleted_at IS NULL`,
      );
      return row?.count ?? 0;
    },

    async insert(list) {
      const values = toValues(list);
      await db.run(
        `INSERT INTO lists (${COLUMNS.join(', ')}) VALUES (${INSERT_PLACEHOLDERS})`,
        COLUMNS.map((column) => values[column]),
      );
    },

    async update(list) {
      const values = toValues(list);
      await db.run(`UPDATE lists SET ${UPDATE_ASSIGNMENTS} WHERE id = ? AND deleted_at IS NULL`, [
        ...UPDATABLE_COLUMNS.map((column) => values[column]),
        list.id,
      ]);
    },

    async softDelete(id, deletedAt) {
      await db.run(
        'UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [deletedAt, deletedAt, id],
      );
    },
  };
}
