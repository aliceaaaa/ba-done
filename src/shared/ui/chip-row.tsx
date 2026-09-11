import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme';

export type ChipOption<T extends string> = {
  value: T;
  label: string;
};

type ChipRowProps<T extends string> = {
  options: readonly ChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  accessibilityLabel: string;
};

export function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
}: ChipRowProps<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option.value)}
            style={[styles.chip, isSelected && styles.selected]}
          >
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  selected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  label: {
    fontSize: 14,
    color: colors.text,
  },
  selectedLabel: {
    color: colors.onAccent,
  },
});
