import { useLocalSearchParams } from 'expo-router';

import { CalendarScreen } from '@/features/calendar';
import { isValidLocalDate } from '@/shared/lib/local-date';

export default function CalendarRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const initialDate = typeof date === 'string' && isValidLocalDate(date) ? date : null;

  return <CalendarScreen key={initialDate ?? 'today'} initialDate={initialDate} />;
}
