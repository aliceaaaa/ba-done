import { Stack, useLocalSearchParams } from 'expo-router';

import { TaskDetailsScreen } from '@/features/task-details';

export default function TaskDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <TaskDetailsScreen taskId={id} />
    </>
  );
}
