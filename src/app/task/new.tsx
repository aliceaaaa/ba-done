import { Stack, useLocalSearchParams } from 'expo-router';

import { useTaskService } from '@/entities/task';
import { CreateTaskScreen } from '@/features/task-editor';
import { isValidLocalDate } from '@/shared/lib/local-date';

export default function NewTaskRoute() {
  const { date, placement } = useLocalSearchParams<{ date?: string; placement?: string }>();
  const service = useTaskService();
  const scheduledDate =
    typeof date === 'string' && isValidLocalDate(date) ? date : service.getToday();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New task' }} />
      <CreateTaskScreen
        placement={placement === 'future' ? 'future' : 'day'}
        date={scheduledDate}
      />
    </>
  );
}
