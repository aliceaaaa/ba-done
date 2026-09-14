import { Stack } from 'expo-router';

import { ArchivedListsScreen } from '@/features/lists';

export default function ArchivedListsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Archived lists' }} />
      <ArchivedListsScreen />
    </>
  );
}
