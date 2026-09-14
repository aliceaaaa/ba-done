import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/shared/ui/theme';

import { useOptionalSystemVoiceEntry } from '../model/system-voice-entry-context';
import type { VoiceEntryUrlParams } from '../model/voice-entry-payload';
import { ProcessingVoiceCommand } from './system-voice-entry-host';

export function VoiceEntryScreen() {
  const services = useOptionalSystemVoiceEntry();
  const params: VoiceEntryUrlParams = useLocalSearchParams();
  const router = useRouter();
  const received = useRef(false);
  const settled = useRef(false);

  useEffect(() => {
    if (received.current) {
      return;
    }
    received.current = true;
    if (services === null) {
      router.replace('/');
      return;
    }
    void services.inbox.receiveDeepLink(params).then(() => {
      settled.current = true;
    });
  }, [services, params, router]);

  useFocusEffect(
    useCallback(() => {
      if (settled.current) {
        router.replace('/');
      }
    }, [router]),
  );

  return (
    <View style={styles.screen}>
      <ProcessingVoiceCommand />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
