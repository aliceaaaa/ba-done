import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VOICE_CONFIG } from '@/shared/config/voice-config';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import type { HandsFreePauseReason } from '../model/hands-free-controller';
import {
  useHandsFreeState,
  useVoiceInputState,
  useVoiceSessionState,
  useVoice,
} from '../model/voice-context';
import type { VoiceDestination } from '../model/voice-command-executor';
import { MIC_LABELS } from './mic-button';

export const VOICE_HOST_TEXT = {
  permissionDenied: 'Microphone or speech recognition access is off. You can still type.',
  unavailable: 'Voice input unavailable on this device right now. You can still type.',
  error: 'Voice input stopped. Try again or type instead.',
  noResult: 'Nothing was heard. Try again.',
  openSettings: 'Open settings',
  dismiss: 'Dismiss',
  cancel: 'Cancel',
  undo: 'Undo',
  open: 'Open',
  handsFreeListening: `Listening for “${VOICE_CONFIG.wakePhraseLabel}”`,
  handsFreeReady: 'Hands-free is on. Listening starts only when you tap Start.',
  handsFreeStart: 'Start',
  handsFreeStop: 'Stop listening',
  handsFreeResume: 'Resume',
  handsFreeCommand: 'Handling your command',
  handsFreeRetrying: 'Reconnecting to speech recognition',
} as const;

const PAUSE_TEXT: Record<HandsFreePauseReason, string> = {
  user: 'Hands-free is paused.',
  background: 'Hands-free stopped because the app left the screen.',
  interrupted: 'Hands-free stopped because audio was interrupted.',
  permissionDenied: 'Hands-free stopped: microphone or speech access is off.',
  unavailable: 'Hands-free stopped: speech recognition is unavailable.',
  tooManyErrors: 'Hands-free stopped after repeated errors.',
  idleLimit: 'Hands-free paused to save battery.',
  manualInput: 'Hands-free is paused while you use the microphone.',
};

export function destinationHref(destination: VoiceDestination) {
  switch (destination.screen) {
    case 'list':
      return { pathname: '/list/[id]', params: { id: destination.listId } } as const;
    case 'future':
      return { pathname: '/future' } as const;
    case 'matches':
      return { pathname: '/', params: { date: destination.date } } as const;
    case 'calendar':
      return { pathname: '/calendar', params: { date: destination.date } } as const;
  }
}

function HandsFreeIndicator() {
  const services = useVoice();
  const state = useHandsFreeState(services);
  if (state.status === 'off') {
    return null;
  }

  let message: string;
  let action: { label: string; onPress: () => void };
  switch (state.status) {
    case 'awaitingConfirmation':
      message = VOICE_HOST_TEXT.handsFreeReady;
      action = {
        label: VOICE_HOST_TEXT.handsFreeStart,
        onPress: () => void services.handsFree.start(),
      };
      break;
    case 'paused':
      message = PAUSE_TEXT[state.pauseReason ?? 'user'];
      action =
        state.pauseReason === 'permissionDenied'
          ? { label: VOICE_HOST_TEXT.openSettings, onPress: () => void services.openSettings() }
          : {
              label: VOICE_HOST_TEXT.handsFreeResume,
              onPress: () => void services.handsFree.start(),
            };
      break;
    case 'handlingCommand':
      message = VOICE_HOST_TEXT.handsFreeCommand;
      action = {
        label: VOICE_HOST_TEXT.handsFreeStop,
        onPress: () => void services.handsFree.pause(),
      };
      break;
    case 'retrying':
      message = VOICE_HOST_TEXT.handsFreeRetrying;
      action = {
        label: VOICE_HOST_TEXT.handsFreeStop,
        onPress: () => void services.handsFree.pause(),
      };
      break;
    default:
      message = VOICE_HOST_TEXT.handsFreeListening;
      action = {
        label: VOICE_HOST_TEXT.handsFreeStop,
        onPress: () => void services.handsFree.pause(),
      };
  }
  const active = state.status === 'starting' || state.status === 'waitingForWakePhrase';

  return (
    <SafeAreaView edges={['top']} style={styles.indicatorArea} pointerEvents="box-none">
      <View
        style={[styles.indicator, active && styles.indicatorActive]}
        accessibilityLiveRegion="polite"
        testID="hands-free-indicator"
      >
        <Text style={[styles.indicatorText, active && styles.indicatorTextActive]}>
          {active ? '🎙 ' : '⏸ '}
          {message}
        </Text>
        <TextButton label={action.label} onPress={action.onPress} />
      </View>
    </SafeAreaView>
  );
}

function ListeningPanel() {
  const services = useVoice();
  const state = useVoiceInputState(services);
  if (state.mode !== 'manual') {
    return null;
  }

  if (['requestingPermission', 'listening', 'processing'].includes(state.status)) {
    const heading =
      state.status === 'listening'
        ? MIC_LABELS.listening
        : state.status === 'processing'
          ? MIC_LABELS.processing
          : MIC_LABELS.requesting;
    return (
      <View style={styles.panel} testID="voice-listening-panel">
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.panelTitle}>
          {state.status === 'listening' ? '● ' : '… '}
          {heading}
        </Text>
        {state.partialTranscript.length > 0 ? (
          <Text style={styles.panelTranscript}>{state.partialTranscript}</Text>
        ) : null}
        <View style={styles.actions}>
          {state.status === 'listening' ? (
            <TextButton
              label={MIC_LABELS.stop}
              variant="primary"
              onPress={() => void services.controller.stop()}
            />
          ) : null}
          <TextButton
            label={VOICE_HOST_TEXT.cancel}
            onPress={() => void services.controller.cancel()}
          />
        </View>
      </View>
    );
  }

  const message =
    state.status === 'permissionDenied'
      ? VOICE_HOST_TEXT.permissionDenied
      : state.status === 'unavailable'
        ? VOICE_HOST_TEXT.unavailable
        : state.status === 'error'
          ? VOICE_HOST_TEXT.error
          : null;
  if (message === null) {
    return null;
  }
  return (
    <View style={styles.panel} accessibilityRole="alert" testID="voice-status-panel">
      <Text style={styles.panelMessage}>{message}</Text>
      <View style={styles.actions}>
        {state.status === 'permissionDenied' ? (
          <TextButton
            label={VOICE_HOST_TEXT.openSettings}
            variant="primary"
            onPress={() => {
              services.controller.reset();
              void services.openSettings();
            }}
          />
        ) : null}
        <TextButton label={VOICE_HOST_TEXT.dismiss} onPress={() => services.controller.reset()} />
      </View>
    </View>
  );
}

function CommandNotice() {
  const services = useVoice();
  const router = useRouter();
  const { notice } = useVoiceSessionState(services);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = setTimeout(() => services.session.dismissNotice(), 6000);
    return () => clearTimeout(timer);
  }, [notice, services]);

  if (notice === null) {
    return null;
  }
  const { destination } = notice;
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite" testID="voice-notice">
      <Text style={styles.noticeText}>{notice.message}</Text>
      <View style={styles.actions}>
        {notice.undo === null ? null : (
          <TextButton
            label={VOICE_HOST_TEXT.undo}
            onPress={() => void services.session.undoNotice()}
          />
        )}
        {destination === null ? null : (
          <TextButton
            label={VOICE_HOST_TEXT.open}
            onPress={() => {
              services.session.dismissNotice();
              router.navigate(destinationHref(destination));
            }}
          />
        )}
      </View>
    </View>
  );
}

function PreviewNavigator() {
  const services = useVoice();
  const router = useRouter();
  const { pending } = useVoiceSessionState(services);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (pending === null) {
      shown.current = null;
      return;
    }
    if (shown.current !== pending.commandId) {
      shown.current = pending.commandId;
      router.push('/voice-command');
    }
  }, [pending, router]);

  return null;
}

export function VoiceHost() {
  return (
    <>
      <PreviewNavigator />
      <HandsFreeIndicator />
      <View style={styles.bottom} pointerEvents="box-none">
        <ListeningPanel />
        <CommandNotice />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  indicatorArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  indicator: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  indicatorActive: {
    borderColor: colors.danger,
    backgroundColor: colors.eventSurface,
  },
  indicatorText: {
    flex: 1,
    minWidth: 160,
    fontSize: 14,
    color: colors.text,
  },
  indicatorTextActive: {
    fontWeight: '700',
  },
  bottom: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.sm,
  },
  panel: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  panelTranscript: {
    fontSize: 16,
    color: colors.text,
  },
  panelMessage: {
    fontSize: 15,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  notice: {
    gap: spacing.sm,
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  noticeText: {
    color: colors.background,
    fontSize: 15,
  },
});
