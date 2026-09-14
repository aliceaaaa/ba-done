import { ReminderSettingsScreen } from '@/features/reminders';
import { VoiceSettingsSection } from '@/features/voice';

export default function SettingsScreen() {
  return <ReminderSettingsScreen extraSections={<VoiceSettingsSection />} />;
}
