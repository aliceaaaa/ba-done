import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PrioritySlot } from '@/entities/task';
import { colors, spacing } from '@/shared/ui/theme';

type PriorityPickerProps = {
  slots: readonly PrioritySlot[];
  selected: number | null;
  onSelect: (priority: number) => void;
};

export function PriorityPicker({ slots, selected, onSelect }: PriorityPickerProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Priority" style={styles.grid}>
      {slots.map((slot) => {
        const isTaken = slot.occupiedBy !== null;
        const isSelected = slot.priority === selected;
        return (
          <Pressable
            key={slot.priority}
            testID={`priority-option-${slot.priority}`}
            accessibilityRole="radio"
            accessibilityLabel={
              slot.occupiedBy === null
                ? `Priority ${slot.priority}`
                : `Priority ${slot.priority}, taken by ${slot.occupiedBy.title}`
            }
            accessibilityState={{ disabled: isTaken, selected: isSelected }}
            disabled={isTaken}
            onPress={() => onSelect(slot.priority)}
            style={[styles.option, isSelected && styles.selected, isTaken && styles.taken]}
          >
            <Text style={[styles.number, isSelected && styles.selectedText]}>{slot.priority}</Text>
            {slot.occupiedBy === null ? null : (
              <Text style={styles.occupant} numberOfLines={1}>
                {slot.occupiedBy.title}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    width: 60,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  selected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  taken: {
    backgroundColor: colors.surface,
    borderColor: colors.disabled,
  },
  number: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  selectedText: {
    color: colors.onAccent,
  },
  occupant: {
    fontSize: 10,
    color: colors.muted,
  },
});
