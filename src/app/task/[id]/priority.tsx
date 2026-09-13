import { Stack, useLocalSearchParams } from 'expo-router';

import { ChangePriorityScreen } from '@/features/reminders';
import { UI_STRINGS } from '@/shared/config/ui-strings';

export default function ChangePriorityRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: UI_STRINGS.reminderActions.changePriority }}
      />
      <ChangePriorityScreen taskId={id} />
    </>
  );
}
