import { createContext, useContext, type ReactNode } from 'react';

import type { CalendarEventService } from './calendar-event-service';

const CalendarEventServiceContext = createContext<CalendarEventService | null>(null);

type CalendarEventServiceProviderProps = {
  service: CalendarEventService;
  children: ReactNode;
};

export function CalendarEventServiceProvider({
  service,
  children,
}: CalendarEventServiceProviderProps) {
  return (
    <CalendarEventServiceContext.Provider value={service}>
      {children}
    </CalendarEventServiceContext.Provider>
  );
}

export function useCalendarEventService(): CalendarEventService {
  const service = useContext(CalendarEventServiceContext);
  if (service === null) {
    throw new Error('CalendarEventServiceProvider is missing');
  }
  return service;
}
