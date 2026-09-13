import {
  eventLocalDates,
  eventOccursOn,
  eventStatus,
  formatEventTimesForDay,
  type CalendarEvent,
  type EventStatus,
} from '@/entities/calendar-event';
import { DAY_PERIODS, type DayPeriod, type ScheduledTask } from '@/entities/task';

export type AgendaEventItem = {
  event: CalendarEvent;
  timeLabel: string;
  status: EventStatus;
  overlaps: boolean;
};

export type AgendaPeriodGroup = {
  period: DayPeriod;
  tasks: ScheduledTask[];
};

export type DayAgenda = {
  date: string;
  allDayEvents: AgendaEventItem[];
  timedEvents: AgendaEventItem[];
  exactTimeTasks: ScheduledTask[];
  periodGroups: AgendaPeriodGroup[];
  anyTimeTasks: ScheduledTask[];
  isEmpty: boolean;
};

export type DayCounts = {
  tasks: number;
  events: number;
};

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function compareTimed(a: CalendarEvent, b: CalendarEvent): number {
  const aStart = a.startAt ?? '';
  const bStart = b.startAt ?? '';
  if (aStart !== bStart) {
    return aStart < bStart ? -1 : 1;
  }
  const aEnd = a.endAt ?? '';
  const bEnd = b.endAt ?? '';
  if (aEnd !== bEnd) {
    return aEnd < bEnd ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

function overlapsAnother(event: CalendarEvent, others: readonly CalendarEvent[]): boolean {
  if (event.allDay) {
    return false;
  }
  return others.some(
    (other) =>
      other.id !== event.id &&
      !other.allDay &&
      other.startAt < event.endAt &&
      other.endAt > event.startAt,
  );
}

export function buildDayAgenda(
  date: string,
  tasks: readonly ScheduledTask[],
  events: readonly CalendarEvent[],
  timeZone: string,
  now: Date,
): DayAgenda {
  const dayTasks = uniqueById(tasks).filter(
    (task) => task.status === 'active' && task.scheduledDate === date,
  );
  const dayEvents = uniqueById(events).filter(
    (event) => event.deletedAt === null && eventOccursOn(event, date, timeZone),
  );
  const toItem = (event: CalendarEvent, timed: readonly CalendarEvent[]): AgendaEventItem => ({
    event,
    timeLabel: formatEventTimesForDay(event, date, timeZone),
    status: eventStatus(event, now, timeZone),
    overlaps: overlapsAnother(event, timed),
  });
  const allDay = dayEvents
    .filter((event) => event.allDay)
    .sort((a, b) =>
      (a.startDate ?? '') === (b.startDate ?? '')
        ? a.title.localeCompare(b.title)
        : (a.startDate ?? '') < (b.startDate ?? '')
          ? -1
          : 1,
    );
  const timed = dayEvents.filter((event) => !event.allDay).sort(compareTimed);
  const exactTimeTasks = dayTasks
    .filter((task) => task.exactTime !== null)
    .map((task, index) => ({ task, index }))
    .sort((a, b) =>
      (a.task.exactTime ?? '') === (b.task.exactTime ?? '')
        ? a.index - b.index
        : (a.task.exactTime ?? '') < (b.task.exactTime ?? '')
          ? -1
          : 1,
    )
    .map((entry) => entry.task);
  const periodGroups = DAY_PERIODS.map((period) => ({
    period,
    tasks: dayTasks.filter((task) => task.exactTime === null && task.dayPeriod === period),
  })).filter((group) => group.tasks.length > 0);
  const anyTimeTasks = dayTasks.filter(
    (task) => task.exactTime === null && task.dayPeriod === null,
  );
  return {
    date,
    allDayEvents: allDay.map((event) => toItem(event, timed)),
    timedEvents: timed.map((event) => toItem(event, timed)),
    exactTimeTasks,
    periodGroups,
    anyTimeTasks,
    isEmpty: dayTasks.length === 0 && dayEvents.length === 0,
  };
}

export function countByDate(
  tasks: readonly ScheduledTask[],
  events: readonly CalendarEvent[],
  timeZone: string,
): Map<string, DayCounts> {
  const counts = new Map<string, DayCounts>();
  const bump = (date: string, key: keyof DayCounts) => {
    const current = counts.get(date) ?? { tasks: 0, events: 0 };
    counts.set(date, { ...current, [key]: current[key] + 1 });
  };
  for (const task of uniqueById(tasks)) {
    if (task.status === 'active') {
      bump(task.scheduledDate, 'tasks');
    }
  }
  for (const event of uniqueById(events)) {
    if (event.deletedAt === null) {
      for (const date of eventLocalDates(event, timeZone)) {
        bump(date, 'events');
      }
    }
  }
  return counts;
}
