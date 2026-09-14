import { ReminderSettingsScreen } from '@/features/reminders';
import { VoiceShortcutsSection } from '@/features/system-voice-entry';
import { VoiceSettingsSection } from '@/features/voice';

export default function SettingsScreen() {
  return (
    <ReminderSettingsScreen
      extraSections={
        <>
          <VoiceSettingsSection />
          <VoiceShortcutsSection />
        </>
      }
    />
  );
}
