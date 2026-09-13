import { Stack, useLocalSearchParams } from 'expo-router';

import { RemindLaterScreen } from '@/features/reminders';
import { UI_STRINGS } from '@/shared/config/ui-strings';

export default function RemindLaterRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: UI_STRINGS.reminderActions.remindLater }}
      />
      <RemindLaterScreen taskId={id} />
    </>
  );
}
