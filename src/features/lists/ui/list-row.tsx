import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  LIST_COLOR_LABELS,
  LIST_COLOR_VALUES,
  LIST_ICON_SYMBOLS,
  formatActiveCount,
  type ListSummary,
} from '@/entities/list';
import { colors, spacing } from '@/shared/ui/theme';

type ListRowProps = {
  list: ListSummary;
  onPress: (list: ListSummary) => void;
};

export function ListRow({ list, onPress }: ListRowProps) {
  const count = formatActiveCount(list.activeItemCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${list.title}, ${count}`}
      accessibilityHint="Opens the list"
      onPress={() => onPress(list)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`list-row-${list.id}`}
    >
      <View
        style={[styles.icon, { borderColor: LIST_COLOR_VALUES[list.color] }]}
        accessibilityLabel={`${LIST_COLOR_LABELS[list.color]} color`}
      >
        <Text style={styles.symbol}>{LIST_ICON_SYMBOLS[list.icon]}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{list.title}</Text>
        <Text style={styles.meta}>{count}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  icon: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: {
    fontSize: 20,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
  },
  chevron: {
    fontSize: 24,
    color: colors.muted,
  },
});
