import { createContext, useContext, type ReactNode } from 'react';

import type { ListService } from './list-service';

const ListServiceContext = createContext<ListService | null>(null);

type ListServiceProviderProps = {
  service: ListService;
  children: ReactNode;
};

export function ListServiceProvider({ service, children }: ListServiceProviderProps) {
  return <ListServiceContext.Provider value={service}>{children}</ListServiceContext.Provider>;
}

export function useOptionalListService(): ListService | null {
  return useContext(ListServiceContext);
}

export function useListService(): ListService {
  const service = useContext(ListServiceContext);
  if (service === null) {
    throw new Error('ListServiceProvider is missing');
  }
  return service;
}
