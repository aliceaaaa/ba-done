import { Stack, useLocalSearchParams } from 'expo-router';

import { ListScreen } from '@/features/lists';

export default function ListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'List' }} />
      <ListScreen key={id} listId={id} />
    </>
  );
}
