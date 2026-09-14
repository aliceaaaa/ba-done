import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { HANDS_FREE_TOGGLE_LABEL } from '@/shared/config/voice-config';
import { ChipRow, type ChipOption } from '@/shared/ui/chip-row';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import type { SpeechPermission } from '../model/speech-recognition-adapter';
import { useOptionalVoice, useVoiceSessionState, useVoiceSettings } from '../model/voice-context';
import type { VoiceServices } from '../model/voice-services';
import { RECOGNITION_LANGUAGES, type RecognitionLanguage } from '../model/voice-settings';

export const VOICE_SETTINGS_TEXT = {
  title: 'Voice',
  language: 'Recognition language',
  languageHint: 'Voice commands are understood in English and Russian.',
  permission: 'Microphone and speech recognition',
  granted: 'Allowed.',
  denied: 'Not allowed. Voice input is off until you allow access in Settings.',
  undetermined: 'The app asks for access when you tap the microphone.',
  unavailable: 'Voice input unavailable on this device. You can always type instead.',
  openSettings: 'Open settings',
  handsFreeHint:
    'Works only while the app is open and on screen. Listening stops when you leave the app, during calls and after repeated errors. The app never listens when it is closed or in the background.',
  handsFreeDenied: 'Hands-free needs microphone and speech recognition access.',
  processing:
    'Speech is converted to text by the speech recognition service of your device (Apple or Google). The service may send audio to its servers, and offline recognition depends on your device and installed languages. This app does not record or store audio. A transcript is kept only while a voice command is open.',
  deleteHistory: 'Delete voice history',
  historyEmpty: 'Voice history is empty. No recordings or finished commands are stored.',
  historyDeleted: 'The open voice command was deleted.',
} as const;

const LANGUAGE_OPTIONS: readonly ChipOption<RecognitionLanguage>[] = RECOGNITION_LANGUAGES.map(
  (language) => ({ value: language.value, label: language.label }),
);

function VoiceSettingsContent({ services }: { services: VoiceServices }) {
  const settings = useVoiceSettings(services);
  const session = useVoiceSessionState(services);
  const [permission, setPermission] = useState<SpeechPermission | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextAvailable, nextPermission] = await Promise.all([
        services.adapter.isAvailable(),
        services.adapter.getPermissionStatus(),
      ]);
      setAvailable(nextAvailable);
      setPermission(nextPermission);
    } catch {
      setAvailable(false);
    }
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function toggleHandsFree(enabled: boolean) {
    setMessage(null);
    const changed = await services.setHandsFreeEnabled(enabled);
    if (!changed) {
      setMessage(VOICE_SETTINGS_TEXT.handsFreeDenied);
    }
    await refresh();
  }

  function deleteHistory() {
    const hadHistory = session.pending !== null;
    services.session.clearHistory();
    setMessage(hadHistory ? VOICE_SETTINGS_TEXT.historyDeleted : VOICE_SETTINGS_TEXT.historyEmpty);
  }

  const permissionText =
    available === false
      ? VOICE_SETTINGS_TEXT.unavailable
      : permission === null
        ? null
        : VOICE_SETTINGS_TEXT[permission.status];

  return (
    <View style={styles.section} testID="voice-settings">
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {VOICE_SETTINGS_TEXT.title}
      </Text>

      <Text style={styles.rowLabel}>{VOICE_SETTINGS_TEXT.language}</Text>
      <ChipRow
        accessibilityLabel={VOICE_SETTINGS_TEXT.language}
        options={LANGUAGE_OPTIONS}
        selected={settings.language}
        onSelect={(language) => void services.settings.update({ language })}
      />
      <Text style={styles.hint}>{VOICE_SETTINGS_TEXT.languageHint}</Text>

      <Text style={styles.rowLabel}>{VOICE_SETTINGS_TEXT.permission}</Text>
      {permissionText === null ? null : (
        <Text style={styles.hint} testID="voice-permission-status">
          {permissionText}
        </Text>
      )}
      {permission?.status === 'denied' && available !== false ? (
        <TextButton
          label={VOICE_SETTINGS_TEXT.openSettings}
          onPress={() => void services.openSettings()}
        />
      ) : null}

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{HANDS_FREE_TOGGLE_LABEL}</Text>
        <Switch
          accessibilityLabel={HANDS_FREE_TOGGLE_LABEL}
          value={settings.handsFreeEnabled}
          disabled={available === false}
          onValueChange={(enabled) => void toggleHandsFree(enabled)}
        />
      </View>
      <Text style={styles.hint}>{VOICE_SETTINGS_TEXT.handsFreeHint}</Text>

      <Text style={styles.hint}>{VOICE_SETTINGS_TEXT.processing}</Text>
      <TextButton label={VOICE_SETTINGS_TEXT.deleteHistory} onPress={deleteHistory} />
      {message === null ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.hint} testID="voice-settings-message">
          {message}
        </Text>
      )}
    </View>
  );
}

export function VoiceSettingsSection() {
  const services = useOptionalVoice();
  return services === null ? null : <VoiceSettingsContent services={services} />;
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  rowLabel: {
    fontSize: 16,
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  hint: {
    fontSize: 14,
    color: colors.muted,
  },
});
