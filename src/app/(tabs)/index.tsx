import { useLocalSearchParams } from 'expo-router';

import { TodayScreen } from '@/features/today-deck';
import { isValidLocalDate } from '@/shared/lib/local-date';

export default function TodayRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const initialDate = typeof date === 'string' && isValidLocalDate(date) ? date : null;

  return <TodayScreen key={initialDate ?? 'today'} initialDate={initialDate} />;
}
