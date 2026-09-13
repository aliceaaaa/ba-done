import type { ReminderInput, TaskResult, TaskService } from '@/entities/task';

import type { ReminderCoordinator } from './reminder-coordinator';

function setsReminder(reminder: ReminderInput | null | undefined): boolean {
  return reminder !== undefined && reminder !== null;
}

export function createSyncedTaskService(
  service: TaskService,
  coordinator: ReminderCoordinator,
): TaskService {
  async function synced<T>(
    result: TaskResult<T>,
    taskIds: (value: T) => string[],
    requestPermission = false,
  ): Promise<TaskResult<T>> {
    if (result.ok) {
      for (const taskId of taskIds(result.value)) {
        await coordinator.syncTask(taskId, { requestPermission });
      }
    }
    return result;
  }

  return {
    ...service,

    async createTask(input) {
      return synced(
        await service.createTask(input),
        (task) => [task.id],
        setsReminder(input.reminder),
      );
    },

    async createFutureTask(input) {
      return synced(await service.createFutureTask(input), (task) => [task.id]);
    },

    async updateTask(id, patch) {
      return synced(await service.updateTask(id, patch), () => [id], setsReminder(patch.reminder));
    },

    async editTask(id, input) {
      return synced(await service.editTask(id, input), () => [id], setsReminder(input.reminder));
    },

    async changePriority(id, priority) {
      return synced(await service.changePriority(id, priority), () => [id]);
    },

    async convertCarryOverToRanked(id, priority) {
      return synced(await service.convertCarryOverToRanked(id, priority), () => [id]);
    },

    async swapPriorities(firstId, secondId) {
      return synced(await service.swapPriorities(firstId, secondId), () => [firstId, secondId]);
    },

    async completeTask(id) {
      return synced(await service.completeTask(id), () => [id]);
    },

    async postponeUntilTomorrow(id) {
      return synced(await service.postponeUntilTomorrow(id), () => [id]);
    },

    async rescheduleTask(id, slot) {
      return synced(await service.rescheduleTask(id, slot), () => [id]);
    },

    async scheduleFutureTask(id, slot) {
      return synced(await service.scheduleFutureTask(id, slot), () => [id]);
    },

    async moveTaskToFuture(id, options) {
      return synced(await service.moveTaskToFuture(id, options), () => [id]);
    },

    async deleteTask(id) {
      return synced(await service.deleteTask(id), () => [id]);
    },

    async undo(eventId) {
      return synced(await service.undo(eventId), (task) => [task.id]);
    },

    async snoozeReminder(id, localDateTime) {
      return synced(await service.snoozeReminder(id, localDateTime), () => [id], true);
    },
  };
}
