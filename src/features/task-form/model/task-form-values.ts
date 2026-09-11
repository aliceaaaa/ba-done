import type { DayPeriod, Task, TaskDetailsInput } from '@/entities/task';

export type TimeMode = 'none' | 'exact' | 'period';

export type TaskFormValues = {
  title: string;
  description: string;
  timeMode: TimeMode;
  exactTime: string;
  dayPeriod: DayPeriod;
  durationMinutes: string;
  address: string;
  travelMinutes: string;
  thingsToTake: string;
};

export type TaskFormInput = Omit<TaskDetailsInput, 'reminder'> & { title: string };

export const EMPTY_TASK_FORM: TaskFormValues = {
  title: '',
  description: '',
  timeMode: 'none',
  exactTime: '',
  dayPeriod: 'morning',
  durationMinutes: '',
  address: '',
  travelMinutes: '',
  thingsToTake: '',
};

function timeModeOf(task: Task): TimeMode {
  if (task.exactTime !== null) {
    return 'exact';
  }
  return task.dayPeriod === null ? 'none' : 'period';
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : Number(trimmed);
}

export function valuesFromTask(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? '',
    timeMode: timeModeOf(task),
    exactTime: task.exactTime ?? '',
    dayPeriod: task.dayPeriod ?? 'morning',
    durationMinutes: numberText(task.durationMinutes),
    address: task.address ?? '',
    travelMinutes: numberText(task.travelMinutes),
    thingsToTake: task.thingsToTake.join('\n'),
  };
}

export function toTaskInput(values: TaskFormValues): TaskFormInput {
  return {
    title: values.title,
    description: values.description,
    exactTime: values.timeMode === 'exact' ? values.exactTime.trim() : null,
    dayPeriod: values.timeMode === 'period' ? values.dayPeriod : null,
    durationMinutes: parseOptionalNumber(values.durationMinutes),
    address: values.address,
    travelMinutes: parseOptionalNumber(values.travelMinutes),
    thingsToTake: values.thingsToTake
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  };
}
