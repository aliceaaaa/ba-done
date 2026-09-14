import { Stack } from 'expo-router';

import { VoiceCommandPreviewScreen } from '@/features/voice';

export default function VoiceCommandRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Voice command' }} />
      <VoiceCommandPreviewScreen />
    </>
  );
}
