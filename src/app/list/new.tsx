import { Stack } from 'expo-router';

import { ListEditorScreen } from '@/features/lists';

export default function NewListRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New list' }} />
      <ListEditorScreen mode="create" />
    </>
  );
}
