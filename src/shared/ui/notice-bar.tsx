import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme';

const VISIBLE_MS = 6000;

type NoticeBarProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
};

export function NoticeBar({ message, actionLabel, onAction, onDismiss }: NoticeBarProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <View style={styles.bar} accessibilityLiveRegion="polite" testID="notice-bar">
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel === undefined || onAction === undefined ? null : (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={spacing.sm}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      )}
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
