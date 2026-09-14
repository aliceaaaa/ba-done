import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '@/shared/ui/theme';

import type { VoiceCommandHint } from '../model/voice-command';
import { useOptionalVoice, useVoiceInputState } from '../model/voice-context';
import type { VoiceServices } from '../model/voice-services';

export const MIC_LABELS = {
  start: 'Start listening',
  listening: 'Listening',
  stop: 'Stop listening',
  processing: 'Processing',
  requesting: 'Waiting for permission',
  unavailable: 'Voice input unavailable',
} as const;

type MicButtonProps = {
  hint: VoiceCommandHint;
  testID?: string;
};

function MicButtonContent({
  hint,
  testID,
  services,
}: MicButtonProps & { services: VoiceServices }) {
  const state = useVoiceInputState(services);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    void services.adapter
      .isAvailable()
      .catch(() => false)
      .then((next) => {
        if (active) {
          setAvailable(next);
        }
      });
    return () => {
      active = false;
    };
  }, [services]);

  const manual = state.mode === 'manual';
  const status = manual ? state.status : 'idle';
  const unavailable = !available || (manual && state.status === 'unavailable');

  let label: string = MIC_LABELS.start;
  let text = '🎙 Voice';
  let value: string | undefined;
  let busy = false;
  if (unavailable) {
    label = MIC_LABELS.unavailable;
    text = '🎙 Voice off';
  } else if (status === 'listening') {
    label = MIC_LABELS.stop;
    value = MIC_LABELS.listening;
    text = '■ Stop';
  } else if (status === 'processing') {
    label = MIC_LABELS.processing;
    text = '… Processing';
    busy = true;
  } else if (status === 'requestingPermission') {
    label = MIC_LABELS.requesting;
    text = '… Waiting';
    busy = true;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={unavailable ? 'You can still type instead' : undefined}
      accessibilityState={{ busy, disabled: busy }}
      {...(value === undefined ? {} : { accessibilityValue: { text: value } })}
      disabled={busy}
      hitSlop={spacing.sm}
      onPress={() => void services.startManual(hint)}
      style={({ pressed }) => [
        styles.button,
        status === 'listening' && styles.listening,
        unavailable && styles.unavailable,
        pressed && styles.pressed,
      ]}
      testID={testID ?? 'mic-button'}
    >
      <Text style={[styles.text, status === 'listening' && styles.listeningText]}>{text}</Text>
    </Pressable>
  );
}

export function MicButton(props: MicButtonProps) {
  const services = useOptionalVoice();
  return services === null ? null : <MicButtonContent {...props} services={services} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  listening: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  unavailable: {
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  listeningText: {
    color: colors.onAccent,
  },
});
