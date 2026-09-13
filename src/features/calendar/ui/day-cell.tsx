import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/shared/ui/theme';

import { dayOfMonth, formatDayLong, formatWeekday } from '../model/calendar-period';
import type { DayCounts } from '../model/day-agenda';

type DayCellProps = {
  date: string;
  counts: DayCounts;
  selected: boolean;
  today: boolean;
  muted?: boolean;
  showWeekday?: boolean;
  onPress: (date: string) => void;
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function dayCellLabel(date: string, counts: DayCounts, today: boolean): string {
  return [
    formatDayLong(date),
    today ? 'Today' : null,
    plural(counts.tasks, 'task'),
    plural(counts.events, 'event'),
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
}

export function DayCell({
  date,
  counts,
  selected,
  today,
  muted = false,
  showWeekday = false,
  onPress,
}: DayCellProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dayCellLabel(date, counts, today)}
      accessibilityState={{ selected }}
      onPress={() => onPress(date)}
      testID={`day-cell-${date}`}
      style={[styles.cell, today && styles.today, selected && styles.selected]}
    >
      {showWeekday ? (
        <Text style={[styles.weekday, selected && styles.selectedText]}>{formatWeekday(date)}</Text>
      ) : null}
      <Text
        style={[styles.day, muted && styles.muted, selected && styles.selectedText]}
        allowFontScaling
      >
        {dayOfMonth(date)}
      </Text>
      <View style={styles.dots}>
        {counts.tasks > 0 ? (
          <View style={[styles.dot, styles.taskDot, selected && styles.selectedDot]} />
        ) : null}
        {counts.events > 0 ? (
          <View style={[styles.dot, styles.eventDot, selected && styles.selectedDot]} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: spacing.xs,
    gap: 2,
  },
  today: {
    borderColor: colors.accent,
  },
  selected: {
    backgroundColor: colors.accent,
  },
  weekday: {
    fontSize: 12,
    color: colors.muted,
  },
  day: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  muted: {
    color: colors.disabled,
  },
  selectedText: {
    color: colors.onAccent,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    minHeight: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  taskDot: {
    backgroundColor: colors.accent,
  },
  eventDot: {
    backgroundColor: colors.event,
  },
  selectedDot: {
    backgroundColor: colors.onAccent,
  },
});
