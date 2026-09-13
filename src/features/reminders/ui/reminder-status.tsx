import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CalendarEvent } from '@/entities/calendar-event';
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
  inPast: 'Reminder time is already in the past. Edit to choose a future time.',
} as const;

type ReminderStatusProps = { task: Task; event?: never } | { event: CalendarEvent; task?: never };

export function ReminderStatus({ task, event }: ReminderStatusProps) {
  const coordinator = useOptionalReminders();
  const [state, setState] = useState<ReminderDisplayState>({ kind: 'none' });
  const ownerId = task?.id ?? event?.id ?? '';

  useEffect(() => {
    if (coordinator === null) {
      return;
    }
    let active = true;
    const load = () => {
      const pending =
        task !== undefined
          ? coordinator.getDisplayState(task)
          : event !== undefined
            ? coordinator.getEventDisplayState(event)
            : Promise.resolve<ReminderDisplayState>({ kind: 'none' });
      void pending.then((next) => {
        if (active) {
          setState(next);
        }
      });
    };
    load();
    const unsubscribe = coordinator.subscribe((sync) => {
      if (sync.ownerId === ownerId) {
        load();
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [coordinator, task, event, ownerId]);

  if (coordinator === null || state.kind === 'none') {
    return null;
  }

  function retry() {
    if (coordinator === null) {
      return;
    }
    if (task !== undefined) {
      void coordinator.syncTask(task.id);
    } else if (event !== undefined) {
      void coordinator.syncEvent(event.id);
    }
  }

  return (
    <View style={styles.row} testID="reminder-status" accessibilityLiveRegion="polite">
      <Text style={[styles.text, state.kind !== 'scheduled' && styles.warning]}>
        {REMINDER_STATUS_TEXT[state.kind]}
      </Text>
      {state.kind === 'permissionDenied' ? (
        <TextButton label="Open settings" onPress={() => void coordinator.openSettings()} />
      ) : null}
      {state.kind === 'failed' ? <TextButton label="Try again" onPress={retry} /> : null}
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
