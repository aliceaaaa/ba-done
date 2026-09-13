import { Stack, useLocalSearchParams } from 'expo-router';

import { useCalendarEventService } from '@/entities/calendar-event';
import { CreateEventScreen } from '@/features/event-editor';
import { isValidLocalDate, toLocalDate } from '@/shared/lib/local-date';

export default function NewEventRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const events = useCalendarEventService();
  const initialDate =
    typeof date === 'string' && isValidLocalDate(date)
      ? date
      : toLocalDate(events.getNow(), events.getTimeZone());

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New event' }} />
      <CreateEventScreen date={initialDate} />
    </>
  );
}
