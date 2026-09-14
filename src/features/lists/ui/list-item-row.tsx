import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatQuantity, type ListItem } from '@/entities/list';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

type ListItemRowProps = {
  item: ListItem;
  readOnly: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: (item: ListItem) => void;
  onEdit: (item: ListItem) => void;
  onDelete: (item: ListItem) => void;
  onMove: (item: ListItem, direction: 'up' | 'down') => void;
};

export function ListItemRow({
  item,
  readOnly,
  canMoveUp,
  canMoveDown,
  onToggle,
  onEdit,
  onDelete,
  onMove,
}: ListItemRowProps) {
  const quantity = formatQuantity(item);
  return (
    <View style={styles.row} testID={`list-item-${item.id}`}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={item.title}
        accessibilityState={{ checked: item.checked, disabled: readOnly }}
        disabled={readOnly}
        hitSlop={spacing.sm}
        onPress={() => onToggle(item)}
        style={styles.main}
      >
        <View style={[styles.box, item.checked && styles.boxChecked]}>
          <Text style={styles.check}>{item.checked ? '✓' : ' '}</Text>
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, item.checked && styles.titleChecked]}>{item.title}</Text>
          {quantity === null ? null : <Text style={styles.meta}>{quantity}</Text>}
          {item.note === null ? null : <Text style={styles.meta}>{item.note}</Text>}
        </View>
      </Pressable>
      {readOnly ? null : (
        <View style={styles.actions}>
          <TextButton
            label="Edit"
            accessibilityLabel={`Edit ${item.title}`}
            onPress={() => onEdit(item)}
          />
          <TextButton
            label="Delete"
            accessibilityLabel={`Delete ${item.title}`}
            onPress={() => onDelete(item)}
          />
          {item.checked ? null : (
            <>
              <TextButton
                label="↑"
                accessibilityLabel={`Move ${item.title} up`}
                disabled={!canMoveUp}
                onPress={() => onMove(item, 'up')}
              />
              <TextButton
                label="↓"
                accessibilityLabel={`Move ${item.title} down`}
                disabled={!canMoveDown}
                onPress={() => onMove(item, 'down')}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  box: {
    minWidth: 28,
    minHeight: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.accent,
  },
  check: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 17,
    color: colors.text,
  },
  titleChecked: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingLeft: 40,
  },
});
