import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/shared/ui/theme';

const VISIBLE_MS = 6000;

type UndoBarProps = {
  message: string;
  canUndo: boolean;
  onUndo: () => void;
  onDismiss: () => void;
};

export function UndoBar({ message, canUndo, onUndo, onDismiss }: UndoBarProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <View style={styles.bar} accessibilityLiveRegion="polite" testID="undo-bar">
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {canUndo ? (
        <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={spacing.sm}>
          <Text style={styles.action}>Undo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  message: {
    flex: 1,
    color: colors.background,
    fontSize: 15,
  },
  action: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
});
