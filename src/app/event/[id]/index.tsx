import { Stack, useLocalSearchParams } from 'expo-router';

import { EventDetailsScreen } from '@/features/event-details';

export default function EventDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <EventDetailsScreen eventId={id} />
    </>
  );
}
