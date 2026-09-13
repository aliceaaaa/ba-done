import { Stack, useLocalSearchParams } from 'expo-router';

import { describeTaskError, useTaskService } from '@/entities/task';
import { RemindLaterScreen } from '@/features/reminders';
import { UI_STRINGS } from '@/shared/config/ui-strings';

export default function RemindLaterRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const service = useTaskService();

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: UI_STRINGS.reminderActions.remindLater }}
      />
      <RemindLaterScreen
        fallbackPath={`/task/${id}`}
        onSnooze={async (localDateTime) => {
          const result = await service.snoozeReminder(id, localDateTime);
          return result.ok ? null : describeTaskError(result.error);
        }}
      />
    </>
  );
}
