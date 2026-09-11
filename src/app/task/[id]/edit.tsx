import { Stack, useLocalSearchParams } from 'expo-router';

import { EditTaskScreen } from '@/features/task-form';

export default function EditTaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Edit task' }} />
      <EditTaskScreen taskId={id} />
    </>
  );
}
