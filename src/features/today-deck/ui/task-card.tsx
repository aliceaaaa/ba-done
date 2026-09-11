import { StyleSheet, Text, View } from 'react-native';

import { taskTimeLabel, type ScheduledTask } from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { colors, spacing } from '@/shared/ui/theme';

type TaskCardProps = {
  task: ScheduledTask;
};

export function TaskCard({ task }: TaskCardProps) {
  const time = taskTimeLabel(task);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>
        {task.placementType === 'ranked' ? (
          <Text style={styles.priority} accessibilityLabel={`Priority ${task.priority}`}>
            {task.priority}
          </Text>
        ) : (
          <Text style={styles.megaCrush}>{UI_STRINGS.carryOverLabel}</Text>
        )}
      </View>
      {task.placementType === 'carryOver' ? (
        <Text style={styles.returnMessage}>{UI_STRINGS.carryOverReturn}</Text>
      ) : null}
      {time === null ? null : <Text style={styles.time}>{time}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  priority: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  megaCrush: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  returnMessage: {
    fontSize: 14,
    color: colors.muted,
  },
  time: {
    fontSize: 14,
    color: colors.muted,
  },
});
