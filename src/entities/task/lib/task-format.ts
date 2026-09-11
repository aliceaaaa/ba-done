import type { TaskError } from '../model/task-errors';
import type { DayPeriod, Task, TaskReminder } from '../model/types';

export const DAY_PERIOD_LABELS: Record<DayPeriod, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatTaskDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T12:00:00.000Z`));
}

export function formatMinutes(minutes: number): string {
  return `${minutes} min`;
}

export function taskTimeLabel(task: Pick<Task, 'exactTime' | 'dayPeriod'>): string | null {
  if (task.exactTime !== null) {
    return task.exactTime;
  }
  return task.dayPeriod === null ? null : DAY_PERIOD_LABELS[task.dayPeriod];
}

export function formatReminder(reminder: TaskReminder): string {
  if (reminder.type === 'exact') {
    const [date = '', time = ''] = reminder.localDateTime.split('T');
    return `${formatTaskDate(date)}, ${time} (${reminder.timeZone})`;
  }
  return `${DAY_PERIOD_LABELS[reminder.period]} (${reminder.timeZone})`;
}

export function describeTaskError(error: TaskError): string {
  return error.type === 'ValidationError'
    ? error.issues.map((issue) => issue.message).join('\n')
    : error.message;
}
