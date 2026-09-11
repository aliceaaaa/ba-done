import { Stack } from 'expo-router';

import { FuturePoolScreen } from '@/features/future-pool';

export default function FutureRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Future' }} />
      <FuturePoolScreen />
    </>
  );
}
