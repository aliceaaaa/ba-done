import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SnoozeOption } from '@/entities/reminder';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { addMinutes, roundUpToMinute, toLocalDateTime } from '@/shared/lib/local-date';
import { DateTimeField } from '@/shared/ui/date-time-field';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { useReminders } from '../model/reminder-context';

export type SnoozeHandler = (localDateTime: string) => Promise<string | null>;

type RemindLaterScreenProps = {
  onSnooze: SnoozeHandler;
  fallbackPath: string;
};

export function RemindLaterScreen({ onSnooze, fallbackPath }: RemindLaterScreenProps) {
  const coordinator = useReminders();
  const router = useRouter();
  const [options, setOptions] = useState<SnoozeOption[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickedDate, setPickedDate] = useState('');
  const [pickedTime, setPickedTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void coordinator.getSnoozeOptions().then((next) => {
      if (active) {
        setOptions(next);
      }
    });
    return () => {
      active = false;
    };
  }, [coordinator]);

  function openPicker() {
    const [date = '', time = ''] = toLocalDateTime(
      roundUpToMinute(addMinutes(coordinator.getNow(), 60)),
      coordinator.getTimeZone(),
    ).split('T');
    setPickedDate(date);
    setPickedTime(time);
    setPicking(true);
  }

  async function snooze(localDateTime: string) {
    const failure = await onSnooze(localDateTime);
    if (failure !== null) {
      setError(failure);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackPath);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="remind-later">
      <Text accessibilityRole="header" style={styles.title}>
        {UI_STRINGS.reminderActions.remindLater}
      </Text>
      {options === null ? null : (
        <View style={styles.options}>
          {options.map((option) => (
            <TextButton
              key={option.key}
              label={option.label}
              disabled={option.localDateTime === null}
              onPress={() => {
                if (option.localDateTime !== null) {
                  void snooze(option.localDateTime);
                }
              }}
            />
          ))}
          <TextButton label="Pick a time" onPress={openPicker} />
        </View>
      )}
      {picking ? (
        <View style={styles.options}>
          <DateTimeField
            mode="date"
            label="Reminder date"
            value={pickedDate}
            onChange={setPickedDate}
          />
          <DateTimeField
            mode="time"
            label="Reminder time"
            value={pickedTime}
            onChange={setPickedTime}
          />
          <TextButton
            label="Save reminder"
            variant="primary"
            onPress={() => void snooze(`${pickedDate}T${pickedTime}`)}
          />
        </View>
      ) : null}
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  options: {
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
