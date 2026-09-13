import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  describeTaskError,
  formatMinutes,
  formatReminder,
  formatTaskDate,
  taskTimeLabel,
  useTaskService,
  type Task,
} from '@/entities/task';
import { ReminderStatus } from '@/features/reminders';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

type DetailsState =
  { status: 'loading' } | { status: 'missing'; message: string } | { status: 'ready'; task: Task };

type TaskDetailsScreenProps = {
  taskId: string;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function TaskDetailsScreen({ taskId }: TaskDetailsScreenProps) {
  const service = useTaskService();
  const router = useRouter();
  const [state, setState] = useState<DetailsState>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void service.getTask(taskId).then((result) => {
        if (active) {
          setState(
            result.ok
              ? { status: 'ready', task: result.value }
              : { status: 'missing', message: describeTaskError(result.error) },
          );
        }
      });
      return () => {
        active = false;
      };
    }, [service, taskId]),
  );

  const toggleThing = useCallback(
    async (index: number, checked: boolean) => {
      const result = await service.setThingToTakeChecked(taskId, index, checked);
      if (result.ok) {
        setState({ status: 'ready', task: result.value });
        setError(null);
      } else {
        setError(describeTaskError(result.error));
      }
    },
    [service, taskId],
  );

  if (state.status === 'loading') {
    return <View style={styles.screen} />;
  }

  if (state.status === 'missing') {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.body}>{state.message}</Text>
      </View>
    );
  }

  const { task } = state;
  const time = taskTimeLabel(task);
  const isFuture = task.scheduledDate === null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="task-details">
      <Text accessibilityRole="header" style={styles.title}>
        {task.title}
      </Text>
      {task.description === null ? null : (
        <Section title={UI_STRINGS.about}>
          <Text style={styles.body}>{task.description}</Text>
        </Section>
      )}
      <View style={styles.rows}>
        {task.placementType === 'ranked' ? (
          <DetailRow label="Priority" value={String(task.priority)} />
        ) : null}
        {task.placementType === 'carryOver' ? (
          <Text style={styles.megaCrush}>{UI_STRINGS.carryOverLabel}</Text>
        ) : null}
        {task.scheduledDate === null ? (
          <DetailRow label="Placement" value="Future" />
        ) : (
          <DetailRow label="Date" value={formatTaskDate(task.scheduledDate)} />
        )}
        {time === null ? null : <DetailRow label="Time" value={time} />}
        {task.durationMinutes === null ? null : (
          <DetailRow label="Duration" value={formatMinutes(task.durationMinutes)} />
        )}
        {task.address === null ? null : <DetailRow label="Address" value={task.address} />}
        {task.travelMinutes === null ? null : (
          <DetailRow label="Travel" value={formatMinutes(task.travelMinutes)} />
        )}
        {task.reminder === null ? null : (
          <DetailRow label="Reminder" value={formatReminder(task.reminder)} />
        )}
        <ReminderStatus task={task} />
        {isFuture && (time !== null || task.reminder !== null) ? (
          <Text style={styles.hint}>Time and reminder apply once the task is scheduled.</Text>
        ) : null}
      </View>
      {task.thingsToTake.length === 0 ? null : (
        <Section title="Things to take">
          {task.thingsToTake.map((item, index) => (
            <Pressable
              key={`${index}:${item.text}`}
              accessibilityRole="checkbox"
              accessibilityLabel={item.text}
              accessibilityState={{ checked: item.checked }}
              onPress={() => void toggleThing(index, !item.checked)}
              style={styles.thing}
            >
              <Text style={styles.checkbox}>{item.checked ? '☑' : '☐'}</Text>
              <Text style={[styles.body, item.checked && styles.checked]}>{item.text}</Text>
            </Pressable>
          ))}
        </Section>
      )}
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <TextButton
        label={UI_STRINGS.edit}
        variant="primary"
        onPress={() => router.push(`/task/${task.id}/edit`)}
      />
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
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  body: {
    fontSize: 16,
    color: colors.text,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.muted,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 15,
    color: colors.text,
  },
  megaCrush: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
  },
  thing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    fontSize: 18,
    color: colors.accent,
  },
  checked: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
