import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ReminderDisplayState } from '@/entities/reminder';
import type { Task } from '@/entities/task';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { useOptionalReminders } from '../model/reminder-context';

export const REMINDER_STATUS_TEXT = {
  scheduled: 'Reminder scheduled',
  pending: 'Reminder will be scheduled shortly',
  permissionDenied: 'Notifications are turned off',
  failed: 'Reminder could not be scheduled',
  inPast: 'Reminder time is already in the past. Edit the task to choose a future time.',
} as const;

type ReminderStatusProps = {
  task: Task;
};

export function ReminderStatus({ task }: ReminderStatusProps) {
  const coordinator = useOptionalReminders();
  const [state, setState] = useState<ReminderDisplayState>({ kind: 'none' });

  useEffect(() => {
    if (coordinator === null) {
      return;
    }
    let active = true;
    const load = () => {
      void coordinator.getDisplayState(task).then((next) => {
        if (active) {
          setState(next);
        }
      });
    };
    load();
    const unsubscribe = coordinator.subscribe((event) => {
      if (event.taskId === task.id) {
        load();
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [coordinator, task]);

  if (coordinator === null || state.kind === 'none') {
    return null;
  }

  return (
    <View style={styles.row} testID="reminder-status" accessibilityLiveRegion="polite">
      <Text style={[styles.text, state.kind !== 'scheduled' && styles.warning]}>
        {REMINDER_STATUS_TEXT[state.kind]}
      </Text>
      {state.kind === 'permissionDenied' ? (
        <TextButton label="Open settings" onPress={() => void coordinator.openSettings()} />
      ) : null}
      {state.kind === 'failed' ? (
        <TextButton label="Try again" onPress={() => void coordinator.syncTask(task.id)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  text: {
    fontSize: 14,
    color: colors.muted,
  },
  warning: {
    color: colors.notTonight,
  },
});
