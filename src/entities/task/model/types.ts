export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 10;

export const TASK_STATUSES = ['active', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const DAY_PERIODS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type DayPeriod = (typeof DAY_PERIODS)[number];

export type DayPeriodTimes = Record<DayPeriod, string>;

export const DEFAULT_DAY_PERIOD_TIMES: DayPeriodTimes = {
  morning: '09:00',
  afternoon: '13:00',
  evening: '18:00',
  night: '21:00',
};

export const PLACEMENT_TYPES = ['ranked', 'carryOver'] as const;
export type PlacementType = (typeof PLACEMENT_TYPES)[number];

export type TaskReminder =
  | { type: 'exact'; localDateTime: string; timeZone: string }
  | { type: 'dayPeriod'; period: DayPeriod; timeZone: string };

export type ReminderInput =
  { type: 'exact'; localDateTime: string } | { type: 'dayPeriod'; period: DayPeriod };

export type ThingToTake = {
  text: string;
  checked: boolean;
};

export type ThingToTakeInput = {
  text: string;
  checked?: boolean;
};

export type TaskDetails = {
  title: string;
  description: string | null;
  exactTime: string | null;
  dayPeriod: DayPeriod | null;
  durationMinutes: number | null;
  address: string | null;
  travelMinutes: number | null;
  thingsToTake: ThingToTake[];
  reminder: TaskReminder | null;
};

export type RankedPosition = {
  placementType: 'ranked';
  priority: number;
  carryOverOrder: null;
};

export type CarryOverPosition = {
  placementType: 'carryOver';
  priority: null;
  carryOverOrder: number;
};

export type DeckPosition = RankedPosition | CarryOverPosition;

export type FuturePlacement = {
  scheduledDate: null;
  placementType: null;
  priority: null;
  carryOverOrder: null;
};

export type ScheduledPlacement = { scheduledDate: string } & DeckPosition;

export type TaskPlacement = FuturePlacement | ScheduledPlacement;

export const FUTURE_PLACEMENT: FuturePlacement = {
  scheduledDate: null,
  placementType: null,
  priority: null,
  carryOverOrder: null,
};

type TaskBase = TaskDetails & {
  id: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type FutureTask = TaskBase & FuturePlacement;
export type RankedTask = TaskBase & { scheduledDate: string } & RankedPosition;
export type CarryOverTask = TaskBase & { scheduledDate: string } & CarryOverPosition;
export type ScheduledTask = RankedTask | CarryOverTask;
export type Task = FutureTask | ScheduledTask;

export type RankedSlot = {
  scheduledDate: string;
  priority: number;
};

export type RankedSlotInput = {
  scheduledDate: string;
  priority: number | null;
};

export type TaskDetailsInput = Partial<Omit<TaskDetails, 'title' | 'reminder' | 'thingsToTake'>> & {
  reminder?: ReminderInput | null;
  thingsToTake?: ThingToTakeInput[];
};

export type CreateTaskInput = TaskDetailsInput & RankedSlotInput & { title: string };

export type CreateFutureTaskInput = TaskDetailsInput & { title: string };

export type UpdateTaskInput = TaskDetailsInput & { title?: string };

export type PlacementChange =
  | { kind: 'keep' }
  | ({ kind: 'ranked' } & RankedSlotInput)
  | { kind: 'future'; clearReminder?: boolean };

export type EditTaskInput = UpdateTaskInput & { placement: PlacementChange };

export type MoveToFutureOptions = {
  clearReminder?: boolean;
};

export type PriorityAvailabilityOptions = {
  exceptTaskId?: string;
};

export type PostponedEvent = {
  id: string;
  taskId: string;
  type: 'postponed';
  fromDate: string;
  toDate: string;
  from: DeckPosition;
  previousUpdatedAt: string | null;
  occurredAt: string;
};

export type CompletedEvent = {
  id: string;
  taskId: string;
  type: 'completed';
  scheduledDate: string | null;
  previousUpdatedAt: string | null;
  occurredAt: string;
};

export type ReminderSnoozedEvent = {
  id: string;
  taskId: string;
  type: 'reminderSnoozed';
  previousReminder: TaskReminder | null;
  reminder: TaskReminder;
  previousUpdatedAt: string | null;
  occurredAt: string;
};

export type TaskEvent = PostponedEvent | CompletedEvent | ReminderSnoozedEvent;

export type PrioritySlot = {
  priority: number;
  occupiedBy: Pick<RankedTask, 'id' | 'title'> | null;
};

export type TaskField = keyof TaskDetails | keyof RankedSlot;

export function isScheduledTask(task: Task): task is ScheduledTask {
  return task.scheduledDate !== null;
}

export function isFutureTask(task: Task): task is FutureTask {
  return task.scheduledDate === null;
}
