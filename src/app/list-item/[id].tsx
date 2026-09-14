import { Stack, useLocalSearchParams } from 'expo-router';

import { ListItemEditorScreen } from '@/features/lists';

export default function EditListItemRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Edit item' }} />
      <ListItemEditorScreen key={id} itemId={id} />
    </>
  );
}
