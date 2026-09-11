import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays } from '@/shared/lib/local-date';

import { TextButton } from './text-button';
import { colors, spacing } from './theme';

type DateSwitcherProps = {
  date: string;
  today: string;
  label: string;
  onChange: (date: string) => void;
};

export function DateSwitcher({ date, today, label, onChange }: DateSwitcherProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        onPress={() => onChange(addDays(date, -1))}
        hitSlop={spacing.sm}
      >
        <Text style={styles.arrow}>‹</Text>
      </Pressable>
      <Text style={styles.date} testID="selected-date">
        {label}
      </Text>
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
  );
}

const styles = StyleSheet.create({
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
  date: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
