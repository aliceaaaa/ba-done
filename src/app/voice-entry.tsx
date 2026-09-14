import { Stack } from 'expo-router';

import { VoiceEntryScreen } from '@/features/system-voice-entry';

export default function VoiceEntryRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Voice command', animation: 'none' }} />
      <VoiceEntryScreen />
    </>
  );
}
