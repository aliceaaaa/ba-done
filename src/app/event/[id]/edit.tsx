import { Stack, useLocalSearchParams } from 'expo-router';

import { EditEventScreen } from '@/features/event-editor';

export default function EditEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Edit event' }} />
      <EditEventScreen eventId={id} />
    </>
  );
}
