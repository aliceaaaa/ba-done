import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays } from '@/shared/lib/local-date';

import { DateTimeField } from './date-time-field';
import { TextButton } from './text-button';
import { colors, spacing } from './theme';

type DateFieldProps = {
  label: string;
  date: string;
  today: string;
  onChange: (date: string) => void;
};

export function DateField({ label, date, today, onChange }: DateFieldProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => onChange(addDays(date, -1))}
          hitSlop={spacing.sm}
        >
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <DateTimeField
          mode="date"
          label={label}
          value={date}
          onChange={onChange}
          showLabel={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => onChange(addDays(date, 1))}
          hitSlop={spacing.sm}
        >
          <Text style={styles.arrow}>›</Text>
        </Pressable>
        {date === today ? null : <TextButton label="Today" onPress={() => onChange(today)} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  arrow: {
    fontSize: 26,
    color: colors.accent,
    paddingHorizontal: spacing.xs,
  },
});
