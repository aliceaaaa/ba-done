import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCalendarEventService, type CalendarEvent } from '@/entities/calendar-event';
import { useTaskService, type ScheduledTask } from '@/entities/task';

import type { DateRange } from './calendar-period';

export type CalendarData =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tasks: ScheduledTask[]; events: CalendarEvent[] };

export function useCalendarData(range: DateRange) {
  const tasks = useTaskService();
  const events = useCalendarEventService();
  const [state, setState] = useState<{ key: string; data: CalendarData }>({
    key: '',
    data: { status: 'loading' },
  });
  const requestId = useRef(0);
  const key = `${range.from}:${range.to}`;

  const load = useCallback(async () => {
    requestId.current += 1;
    const current = requestId.current;
    try {
      const [loadedTasks, loadedEvents] = await Promise.all([
        tasks.getScheduledInRange(range.from, range.to),
        events.listEventsInRange(range.from, range.to),
      ]);
      if (current === requestId.current) {
        setState({ key, data: { status: 'ready', tasks: loadedTasks, events: loadedEvents } });
      }
    } catch {
      if (current === requestId.current) {
        setState({ key, data: { status: 'error' } });
      }
    }
  }, [tasks, events, range.from, range.to, key]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const unsubscribeTasks = tasks.onChange(() => void load());
    const unsubscribeEvents = events.onChange(() => void load());
    return () => {
      unsubscribeTasks();
      unsubscribeEvents();
    };
  }, [tasks, events, load]);

  const retry = useCallback(() => {
    setState({ key, data: { status: 'loading' } });
    void load();
  }, [key, load]);

  const data: CalendarData = state.key === key ? state.data : { status: 'loading' };
  return { data, retry };
}
