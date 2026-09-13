import { createContext, useContext, type ReactNode } from 'react';

import type { ReminderCoordinator } from './reminder-coordinator';

const ReminderContext = createContext<ReminderCoordinator | null>(null);

type ReminderProviderProps = {
  coordinator: ReminderCoordinator;
  children: ReactNode;
};

export function ReminderProvider({ coordinator, children }: ReminderProviderProps) {
  return <ReminderContext.Provider value={coordinator}>{children}</ReminderContext.Provider>;
}

export function useOptionalReminders(): ReminderCoordinator | null {
  return useContext(ReminderContext);
}

export function useReminders(): ReminderCoordinator {
  const coordinator = useContext(ReminderContext);
  if (coordinator === null) {
    throw new Error('ReminderProvider is missing');
  }
  return coordinator;
}
