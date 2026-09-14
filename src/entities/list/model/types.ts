export const LIST_KINDS = ['shopping', 'custom'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const LIST_COLORS = ['blue', 'green', 'orange', 'pink', 'purple', 'gray'] as const;
export type ListColor = (typeof LIST_COLORS)[number];

export const LIST_ICONS = ['cart', 'checklist', 'pill', 'gift', 'home', 'star'] as const;
export type ListIcon = (typeof LIST_ICONS)[number];

export const DEFAULT_SHOPPING_LIST = {
  title: 'Shopping',
  kind: 'shopping',
  color: 'green',
  icon: 'cart',
} as const satisfies { title: string; kind: ListKind; color: ListColor; icon: ListIcon };

export type List = {
  id: string;
  title: string;
  kind: ListKind;
  color: ListColor;
  icon: ListIcon;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type ListSummary = List & {
  activeItemCount: number;
};

export type ListItem = {
  id: string;
  listId: string;
  title: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  checked: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  checkedAt: string | null;
  deletedAt: string | null;
};

export type ListItems = {
  active: ListItem[];
  completed: ListItem[];
};

export type CreateListInput = {
  title: string;
  kind?: ListKind;
  color?: ListColor;
  icon?: ListIcon;
};

export type UpdateListInput = {
  title?: string;
  color?: ListColor;
  icon?: ListIcon;
};

export type ListItemInput = {
  title: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
};

export type UpdateListItemInput = Partial<ListItemInput>;

export type MoveDirection = 'up' | 'down';

export type ListField = 'title' | 'kind' | 'color' | 'icon' | 'quantity' | 'unit' | 'note';
