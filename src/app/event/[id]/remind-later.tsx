import { Stack, useLocalSearchParams } from 'expo-router';

import { describeEventError, useCalendarEventService } from '@/entities/calendar-event';
import { RemindLaterScreen } from '@/features/reminders';
import { UI_STRINGS } from '@/shared/config/ui-strings';

export default function EventRemindLaterRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const events = useCalendarEventService();

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: UI_STRINGS.reminderActions.remindLater }}
      />
      <RemindLaterScreen
        fallbackPath={`/event/${id}`}
        onSnooze={async (localDateTime) => {
          const result = await events.snoozeReminder(id, localDateTime);
          return result.ok ? null : describeEventError(result.error);
        }}
      />
    </>
  );
}
