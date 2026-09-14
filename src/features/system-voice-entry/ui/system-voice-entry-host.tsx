import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { destinationHref, useOptionalVoice } from '@/features/voice';
import { colors, spacing } from '@/shared/ui/theme';

import {
  SYSTEM_VOICE_TEXT,
  type SystemVoiceEntryOutcome,
} from '../model/system-voice-entry-adapter';
import {
  useOptionalSystemVoiceEntry,
  useVoiceEntryInboxState,
  type SystemVoiceEntryServices,
} from '../model/system-voice-entry-context';

export const VOICE_ENTRY_ROUTE = '/voice-entry';

export function ProcessingVoiceCommand({ testID }: { testID?: string }) {
  return (
    <View
      style={styles.processing}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={SYSTEM_VOICE_TEXT.processing}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      testID={testID ?? 'voice-entry-processing'}
    >
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.processingText}>{SYSTEM_VOICE_TEXT.processing}</Text>
    </View>
  );
}

function HostContent({ services }: { services: SystemVoiceEntryServices }) {
  const router = useRouter();
  const pathname = usePathname();
  const voice = useOptionalVoice();
  const { processing } = useVoiceEntryInboxState(services.inbox);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => services.inbox.start(), [services]);

  useEffect(
    () =>
      services.inbox.onOutcome((outcome: SystemVoiceEntryOutcome) => {
        const onEntryRoute = pathnameRef.current === VOICE_ENTRY_ROUTE;
        const go = (href: Parameters<typeof router.navigate>[0]) =>
          onEntryRoute ? router.replace(href) : router.navigate(href);
        switch (outcome.kind) {
          case 'navigate':
          case 'saved':
            go(destinationHref(outcome.destination));
            return;
          case 'startVoiceCapture':
            go({ pathname: '/' });
            void voice?.startManual(outcome.hint);
            return;
          case 'needsInput':
            return;
          case 'rejected':
          case 'failed':
            voice?.session.showNotice({ message: outcome.message, undo: null, destination: null });
            if (onEntryRoute) {
              router.replace('/');
            }
            return;
          case 'duplicate':
            if (onEntryRoute) {
              router.replace('/');
            }
            return;
        }
      }),
    [services, router, voice],
  );

  if (!processing || pathname === VOICE_ENTRY_ROUTE) {
    return null;
  }
  return (
    <View style={styles.overlay}>
      <ProcessingVoiceCommand testID="voice-entry-overlay" />
    </View>
  );
}

export function SystemVoiceEntryHost() {
  const services = useOptionalSystemVoiceEntry();
  return services === null ? null : <HostContent services={services} />;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processing: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  processingText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
});
