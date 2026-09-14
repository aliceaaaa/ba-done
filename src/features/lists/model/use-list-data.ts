import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  useListService,
  type List,
  type ListItems,
  type ListSummary,
} from '@/entities/list';

export type Loadable<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: T };

function useLoadable<T>(load: () => Promise<T>, subscribe: (listener: () => void) => () => void) {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    requestId.current += 1;
    const current = requestId.current;
    try {
      const value = await load();
      if (current === requestId.current) {
        setState({ status: 'ready', value });
      }
    } catch {
      if (current === requestId.current) {
        setState({ status: 'error' });
      }
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => subscribe(() => void reload()), [subscribe, reload]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void reload();
  }, [reload]);

  return { state, setState, reload, retry };
}

export function useLists(archived = false) {
  const service = useListService();
  const load = useCallback(
    () => (archived ? service.getArchivedLists() : service.getLists()),
    [service, archived],
  );
  const subscribe = useCallback((listener: () => void) => service.onChange(listener), [service]);
  return useLoadable<ListSummary[]>(load, subscribe);
}

export type ListDetails = {
  list: List;
  items: ListItems;
} | null;

export function useListDetails(listId: string) {
  const service = useListService();
  const load = useCallback(async (): Promise<ListDetails> => {
    const [list, items] = await Promise.all([service.getList(listId), service.getItems(listId)]);
    return list.ok && items.ok ? { list: list.value, items: items.value } : null;
  }, [service, listId]);
  const subscribe = useCallback((listener: () => void) => service.onChange(listener), [service]);
  return useLoadable<ListDetails>(load, subscribe);
}
