import type {
  DayPeriod,
  PlacementChange,
  ReminderInput,
  Task,
  TaskDetailsInput,
} from '@/entities/task';

export type PlacementMode = 'day' | 'future';
export type TimeMode = 'none' | 'exact' | 'period';
export type ReminderMode = 'none' | 'exact' | 'period';

export type ThingDraft = {
  key: string;
  text: string;
  checked: boolean;
};

export type EditorValues = {
  title: string;
  description: string;
  placementMode: PlacementMode;
  scheduledDate: string;
  priority: number | null;
  timeMode: TimeMode;
  exactTime: string;
  dayPeriod: DayPeriod | null;
  durationMinutes: string;
  address: string;
  travelMinutes: string;
  things: ThingDraft[];
  reminderMode: ReminderMode;
  reminderDate: string;
  reminderTime: string;
  reminderPeriod: DayPeriod | null;
};

export type DetailsDraft = TaskDetailsInput & { title: string };

let thingKeySequence = 0;

export function newThingDraft(text = '', checked = false): ThingDraft {
  thingKeySequence += 1;
  return { key: `thing-${thingKeySequence}`, text, checked };
}

export function createEditorValues(placementMode: PlacementMode, date: string): EditorValues {
  return {
    title: '',
    description: '',
    placementMode,
    scheduledDate: date,
    priority: null,
    timeMode: 'none',
    exactTime: '',
    dayPeriod: null,
    durationMinutes: '',
    address: '',
    travelMinutes: '',
    things: [],
    reminderMode: 'none',
    reminderDate: date,
    reminderTime: '',
    reminderPeriod: null,
  };
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : Number(trimmed);
}

export function editorValuesFromTask(task: Task, today: string): EditorValues {
  const [reminderDate = today, reminderTime = ''] =
    task.reminder?.type === 'exact' ? task.reminder.localDateTime.split('T') : [];
  return {
    title: task.title,
    description: task.description ?? '',
    placementMode: task.scheduledDate === null ? 'future' : 'day',
    scheduledDate: task.scheduledDate ?? today,
    priority: task.priority,
    timeMode: task.exactTime !== null ? 'exact' : task.dayPeriod !== null ? 'period' : 'none',
    exactTime: task.exactTime ?? '',
    dayPeriod: task.dayPeriod,
    durationMinutes: numberText(task.durationMinutes),
    address: task.address ?? '',
    travelMinutes: numberText(task.travelMinutes),
    things: task.thingsToTake.map((item) => newThingDraft(item.text, item.checked)),
    reminderMode:
      task.reminder === null ? 'none' : task.reminder.type === 'exact' ? 'exact' : 'period',
    reminderDate,
    reminderTime,
    reminderPeriod: task.reminder?.type === 'dayPeriod' ? task.reminder.period : null,
  };
}

export const DEFAULT_EXACT_TIME = '09:00';
export const DEFAULT_REMINDER_TIME = '18:00';

export function selectTimeMode(values: EditorValues, timeMode: TimeMode): EditorValues {
  return {
    ...values,
    timeMode,
    exactTime: timeMode === 'exact' ? values.exactTime || DEFAULT_EXACT_TIME : '',
    dayPeriod: timeMode === 'period' ? values.dayPeriod : null,
  };
}

export function selectExactTime(values: EditorValues, exactTime: string): EditorValues {
  return { ...values, timeMode: 'exact', exactTime, dayPeriod: null };
}

export function selectReminderMode(values: EditorValues, reminderMode: ReminderMode): EditorValues {
  if (reminderMode !== 'exact') {
    return { ...values, reminderMode };
  }
  return {
    ...values,
    reminderMode,
    reminderDate:
      values.reminderDate || (values.placementMode === 'day' ? values.scheduledDate : ''),
    reminderTime: values.reminderTime || DEFAULT_REMINDER_TIME,
  };
}

export function selectDayPeriod(values: EditorValues, dayPeriod: DayPeriod): EditorValues {
  return { ...values, timeMode: 'period', dayPeriod, exactTime: '' };
}

export function allowsDatedReminder(placementMode: PlacementMode): boolean {
  return placementMode === 'day';
}

export function selectPlacementMode(
  values: EditorValues,
  placementMode: PlacementMode,
): EditorValues {
  const dropsDatedReminder = !allowsDatedReminder(placementMode) && values.reminderMode === 'exact';
  return {
    ...values,
    placementMode,
    reminderMode: dropsDatedReminder ? 'none' : values.reminderMode,
  };
}

export function reminderInputOf(values: EditorValues): ReminderInput | null {
  if (values.reminderMode === 'exact') {
    return {
      type: 'exact',
      localDateTime: `${values.reminderDate.trim()}T${values.reminderTime.trim()}`,
    };
  }
  if (values.reminderMode === 'period' && values.reminderPeriod !== null) {
    return { type: 'dayPeriod', period: values.reminderPeriod };
  }
  return null;
}

function sameReminder(a: ReminderInput | null, b: ReminderInput | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function toDetailsDraft(values: EditorValues, initial: EditorValues | null): DetailsDraft {
  const reminder = reminderInputOf(values);
  const reminderChanged = initial === null || !sameReminder(reminder, reminderInputOf(initial));
  return {
    title: values.title,
    description: values.description,
    exactTime: values.timeMode === 'exact' ? values.exactTime.trim() : null,
    dayPeriod: values.timeMode === 'period' ? values.dayPeriod : null,
    durationMinutes: parseOptionalNumber(values.durationMinutes),
    address: values.address,
    travelMinutes: parseOptionalNumber(values.travelMinutes),
    thingsToTake: values.things.map((item) => ({ text: item.text, checked: item.checked })),
    ...(reminderChanged ? { reminder } : {}),
  };
}

export function placementChangeFor(
  task: Task,
  values: EditorValues,
  clearReminder: boolean,
): PlacementChange {
  if (values.placementMode === 'future') {
    return task.scheduledDate === null ? { kind: 'keep' } : { kind: 'future', clearReminder };
  }
  const keepsCarryOver =
    task.placementType === 'carryOver' &&
    values.priority === null &&
    values.scheduledDate === task.scheduledDate;
  if (keepsCarryOver) {
    return { kind: 'keep' };
  }
  return { kind: 'ranked', scheduledDate: values.scheduledDate, priority: values.priority };
}
