import type { CalendarEventService, EventResult } from '@/entities/calendar-event';

import type { ReminderCoordinator } from './reminder-coordinator';

export function createSyncedCalendarEventService(
  service: CalendarEventService,
  coordinator: ReminderCoordinator,
): CalendarEventService {
  async function synced<T>(
    result: EventResult<T>,
    eventId: string,
    requestPermission: boolean,
  ): Promise<EventResult<T>> {
    if (result.ok) {
      await coordinator.syncEvent(eventId, { requestPermission });
    }
    return result;
  }

  return {
    ...service,

    async createEvent(input) {
      const result = await service.createEvent(input);
      return result.ok
        ? synced(result, result.value.id, input.reminder !== undefined && input.reminder !== null)
        : result;
    },

    async updateEvent(id, input) {
      return synced(
        await service.updateEvent(id, input),
        id,
        input.reminder !== undefined && input.reminder !== null,
      );
    },

    async deleteEvent(id) {
      return synced(await service.deleteEvent(id), id, false);
    },

    async snoozeReminder(id, localDateTime) {
      return synced(await service.snoozeReminder(id, localDateTime), id, true);
    },
  };
}
