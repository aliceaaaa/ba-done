import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DayPeriodTimes } from '@/entities/reminder';
import { DAY_PERIOD_LABELS, DAY_PERIODS, type DayPeriod } from '@/entities/task';
import { DateTimeField } from '@/shared/ui/date-time-field';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import type { NotificationPermission } from '../model/notification-adapter';
import { useReminders } from '../model/reminder-context';

export const EXACT_ALARM_NOTE =
  'Android may deliver reminders a few minutes late to save battery unless the app is allowed to use exact alarms.';

type ReminderSettingsScreenProps = {
  extraSections?: ReactNode;
};

export function ReminderSettingsScreen({ extraSections = null }: ReminderSettingsScreenProps) {
  const coordinator = useReminders();
  const [times, setTimes] = useState<DayPeriodTimes | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const fetchState = useCallback(
    () => Promise.all([coordinator.getDayPeriodTimes(), coordinator.getPermission()]),
    [coordinator],
  );

  const load = useCallback(async () => {
    const [nextTimes, nextPermission] = await fetchState();
    setTimes(nextTimes);
    setPermission(nextPermission);
  }, [fetchState]);

  useEffect(() => {
    let active = true;
    void fetchState().then(([nextTimes, nextPermission]) => {
      if (active) {
        setTimes(nextTimes);
        setPermission(nextPermission);
      }
    });
    return () => {
      active = false;
    };
  }, [fetchState]);

  async function changeTime(period: DayPeriod, time: string) {
    setTimes((current) => (current === null ? current : { ...current, [period]: time }));
    await coordinator.setDayPeriodTime(period, time);
    await load();
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="settings">
        <Text accessibilityRole="header" style={styles.title}>
          Settings
        </Text>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Times of day
          </Text>
          <Text style={styles.hint}>Reminders set for a time of day use these times.</Text>
          {times === null
            ? null
            : DAY_PERIODS.map((period) => (
                <View key={period} style={styles.row}>
                  <Text style={styles.rowLabel}>{DAY_PERIOD_LABELS[period]}</Text>
                  <DateTimeField
                    mode="time"
                    label={`${DAY_PERIOD_LABELS[period]} time`}
                    value={times[period]}
                    onChange={(time) => void changeTime(period, time)}
                    showLabel={false}
                  />
                </View>
              ))}
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Notifications
          </Text>
          {permission?.status === 'denied' ? (
            <>
              <Text style={styles.hint}>Notifications are turned off for this app.</Text>
              <TextButton label="Open settings" onPress={() => void coordinator.openSettings()} />
            </>
          ) : null}
          {permission?.status === 'granted' ? (
            <Text style={styles.hint}>Notifications are allowed.</Text>
          ) : null}
          {permission?.status === 'undetermined' ? (
            <Text style={styles.hint}>
              The app will ask for permission when you save your first reminder.
            </Text>
          ) : null}
          {coordinator.getExactAlarmSupport() === 'mayBeDelayed' ? (
            <Text style={styles.hint}>{EXACT_ALARM_NOTE}</Text>
          ) : null}
        </View>
        {extraSections}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 16,
    color: colors.text,
  },
  hint: {
    fontSize: 14,
    color: colors.muted,
  },
});
