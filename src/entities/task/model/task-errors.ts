import type { RankedTask, TaskField } from './types';

export type ValidationIssue = {
  field: TaskField;
  message: string;
};

export type TaskValidationError = {
  type: 'ValidationError';
  issues: ValidationIssue[];
  message: string;
};

export type PriorityConflict = {
  type: 'PriorityConflict';
  scheduledDate: string;
  priority: number;
  occupiedBy: Pick<RankedTask, 'id' | 'title'>;
  message: string;
};

export type TaskNotFound = {
  type: 'TaskNotFound';
  id: string;
  message: string;
};

export type TaskAction =
  | 'complete'
  | 'postpone'
  | 'reschedule'
  | 'schedule'
  | 'changePriority'
  | 'convert'
  | 'moveToFuture'
  | 'edit';

export type InvalidTaskStateReason = 'completed' | 'future' | 'scheduled' | 'ranked';

export type InvalidTaskState = {
  type: 'InvalidTaskState';
  id: string;
  action: TaskAction;
  reason: InvalidTaskStateReason;
  message: string;
};

export type SwapNotAllowedReason = 'same-task' | 'not-ranked' | 'different-days';

export type SwapNotAllowed = {
  type: 'SwapNotAllowed';
  reason: SwapNotAllowedReason;
  message: string;
};

export type UndoNotAvailableReason = 'not-found' | 'superseded' | 'state-changed';

export type UndoNotAvailable = {
  type: 'UndoNotAvailable';
  eventId: string;
  reason: UndoNotAvailableReason;
  message: string;
};

export type ReminderClearRequired = {
  type: 'ReminderClearRequired';
  id: string;
  message: string;
};

export type TaskError =
  | TaskValidationError
  | PriorityConflict
  | TaskNotFound
  | InvalidTaskState
  | SwapNotAllowed
  | UndoNotAvailable
  | ReminderClearRequired;

export function validationError(issues: ValidationIssue[]): TaskValidationError {
  return {
    type: 'ValidationError',
    issues,
    message: issues.map((issue) => `${issue.field}: ${issue.message}`).join('; '),
  };
}

export function priorityConflict(occupant: RankedTask): PriorityConflict {
  return {
    type: 'PriorityConflict',
    scheduledDate: occupant.scheduledDate,
    priority: occupant.priority,
    occupiedBy: { id: occupant.id, title: occupant.title },
    message: `Priority ${occupant.priority} on ${occupant.scheduledDate} is already taken by "${occupant.title}"`,
  };
}

export function taskNotFound(id: string): TaskNotFound {
  return { type: 'TaskNotFound', id, message: `Task ${id} not found` };
}

const ACTION_PHRASES: Record<TaskAction, string> = {
  complete: 'complete',
  postpone: 'postpone',
  reschedule: 'reschedule',
  schedule: 'schedule',
  changePriority: 'change the priority of',
  convert: 'convert',
  moveToFuture: 'move to Future',
  edit: 'change the placement of',
};

export function invalidTaskState(
  id: string,
  action: TaskAction,
  reason: InvalidTaskStateReason,
): InvalidTaskState {
  return {
    type: 'InvalidTaskState',
    id,
    action,
    reason,
    message: `Cannot ${ACTION_PHRASES[action]} a ${reason} task`,
  };
}

const SWAP_MESSAGES: Record<SwapNotAllowedReason, string> = {
  'same-task': 'Cannot swap a task with itself',
  'not-ranked': 'Only active ranked tasks can swap priorities',
  'different-days': 'Only tasks scheduled for the same day can swap priorities',
};

export function swapNotAllowed(reason: SwapNotAllowedReason): SwapNotAllowed {
  return { type: 'SwapNotAllowed', reason, message: SWAP_MESSAGES[reason] };
}

const UNDO_MESSAGES: Record<UndoNotAvailableReason, string> = {
  'not-found': 'This action no longer exists',
  superseded: 'Only the latest action of a task can be undone',
  'state-changed': 'The task has changed since this action',
};

export function undoNotAvailable(
  eventId: string,
  reason: UndoNotAvailableReason,
): UndoNotAvailable {
  return { type: 'UndoNotAvailable', eventId, reason, message: UNDO_MESSAGES[reason] };
}

export function reminderClearRequired(id: string): ReminderClearRequired {
  return {
    type: 'ReminderClearRequired',
    id,
    message: 'This task has a reminder. Turn it off to move the task to Future.',
  };
}
