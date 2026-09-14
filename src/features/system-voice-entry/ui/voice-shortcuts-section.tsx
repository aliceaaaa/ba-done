import Constants from 'expo-constants';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import {
  useOptionalSystemVoiceEntry,
  type SystemVoiceEntryServices,
} from '../model/system-voice-entry-context';

export const VOICE_SHORTCUTS_TEXT = {
  title: 'Voice shortcuts',
  explanation:
    'System voice shortcuts use Siri or Google Assistant. The app does not continuously listen in the background.',
  available: 'Available shortcuts',
  siriHint:
    'Say the phrase to Siri. Siri then asks for the details, for example the item or the task title.',
  siriNeedsBuild: 'Siri shortcuts appear after installing a build that includes them.',
  openShortcuts: 'Open Shortcuts',
  androidStatus: 'Android availability',
  androidAssistant:
    'Google Assistant App Actions are not available for this app: Google Assistant has been replaced by Gemini on Android phones, and this app has no verified Gemini integration.',
  androidShortcuts: 'Touch and hold the app icon to use these shortcuts:',
  testCommand: 'Test voice command',
  openVoiceSettings: 'Open voice settings',
} as const;

export const ANDROID_LAUNCHER_SHORTCUTS = [
  'Voice capture',
  'Add item',
  'Capture task',
  'Today',
] as const;

export function siriPhrases(appName: string): string[] {
  return [
    `Add an item to ${appName}`,
    `Capture a task in ${appName}`,
    `Create an event in ${appName}`,
    `Show today in ${appName}`,
    `Start voice capture in ${appName}`,
  ];
}

function appDisplayName(): string {
  return Constants.expoConfig?.name ?? 'the app';
}

function SectionContent({ services }: { services: SystemVoiceEntryServices }) {
  const isIos = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';

  return (
    <View style={styles.section} testID="voice-shortcuts-settings">
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {VOICE_SHORTCUTS_TEXT.title}
      </Text>
      <Text style={styles.hint}>{VOICE_SHORTCUTS_TEXT.explanation}</Text>

      {isIos ? (
        <>
          <Text style={styles.rowLabel}>{VOICE_SHORTCUTS_TEXT.available}</Text>
          {siriPhrases(appDisplayName()).map((phrase) => (
            <Text key={phrase} style={styles.item}>
              • “{phrase}”
            </Text>
          ))}
          <Text style={styles.hint}>
            {services.bridge.isAvailable()
              ? VOICE_SHORTCUTS_TEXT.siriHint
              : VOICE_SHORTCUTS_TEXT.siriNeedsBuild}
          </Text>
          <TextButton
            label={VOICE_SHORTCUTS_TEXT.openShortcuts}
            onPress={() => void services.openShortcutsApp()}
          />
        </>
      ) : null}

      {isAndroid ? (
        <>
          <Text style={styles.rowLabel}>{VOICE_SHORTCUTS_TEXT.androidStatus}</Text>
          <Text style={styles.hint} testID="android-voice-availability">
            {VOICE_SHORTCUTS_TEXT.androidAssistant}
          </Text>
          <Text style={styles.rowLabel}>{VOICE_SHORTCUTS_TEXT.available}</Text>
          <Text style={styles.hint}>{VOICE_SHORTCUTS_TEXT.androidShortcuts}</Text>
          {ANDROID_LAUNCHER_SHORTCUTS.map((label) => (
            <Text key={label} style={styles.item}>
              • {label}
            </Text>
          ))}
        </>
      ) : null}

      <TextButton
        label={VOICE_SHORTCUTS_TEXT.testCommand}
        onPress={() =>
          void services.inbox.receive({ version: 1, action: 'openVoiceCapture' }, 'shortcut')
        }
      />
      <TextButton
        label={VOICE_SHORTCUTS_TEXT.openVoiceSettings}
        onPress={() => void services.openVoiceSettings()}
      />
    </View>
  );
}

export function VoiceShortcutsSection() {
  const services = useOptionalSystemVoiceEntry();
  return services === null ? null : <SectionContent services={services} />;
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
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
  item: {
    fontSize: 15,
    color: colors.text,
  },
  hint: {
    fontSize: 14,
    color: colors.muted,
  },
});
