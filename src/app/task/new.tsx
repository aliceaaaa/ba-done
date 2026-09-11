import { Stack, useLocalSearchParams } from 'expo-router';

import { useTaskService } from '@/entities/task';
import { CreateTaskScreen } from '@/features/task-form';
import { isValidLocalDate } from '@/shared/lib/local-date';

export default function NewTaskRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const service = useTaskService();
  const scheduledDate =
    typeof date === 'string' && isValidLocalDate(date) ? date : service.getToday();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New task' }} />
      <CreateTaskScreen date={scheduledDate} />
    </>
  );
}
