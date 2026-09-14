import { Stack, useLocalSearchParams } from 'expo-router';

import { ListEditorScreen } from '@/features/lists';

export default function EditListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Edit list' }} />
      <ListEditorScreen key={id} mode="edit" listId={id} />
    </>
  );
}
