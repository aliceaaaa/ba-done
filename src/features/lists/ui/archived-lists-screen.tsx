import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { useLists } from '../model/use-list-data';
import { ListRow } from './list-row';

export const ARCHIVED_LISTS_TEXT = {
  empty: 'No archived lists',
  error: 'Could not load archived lists.',
  retry: 'Try again',
  loading: 'Loading archived lists',
} as const;

export function ArchivedListsScreen() {
  const router = useRouter();
  const { state, retry } = useLists(true);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="archived-lists"
    >
      {state.status === 'loading' ? (
        <ActivityIndicator accessibilityLabel={ARCHIVED_LISTS_TEXT.loading} color={colors.accent} />
      ) : null}
      {state.status === 'error' ? (
        <View accessibilityRole="alert" style={styles.state}>
          <Text style={styles.error}>{ARCHIVED_LISTS_TEXT.error}</Text>
          <TextButton label={ARCHIVED_LISTS_TEXT.retry} onPress={retry} />
        </View>
      ) : null}
      {state.status === 'ready' && state.value.length === 0 ? (
        <Text style={styles.empty}>{ARCHIVED_LISTS_TEXT.empty}</Text>
      ) : null}
      {state.status === 'ready'
        ? state.value.map((list) => (
            <ListRow
              key={list.id}
              list={list}
              onPress={(item) => router.push(`/list/${item.id}`)}
            />
          ))
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  state: {
    alignItems: 'center',
    gap: spacing.md,
  },
  empty: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  error: {
    fontSize: 15,
    color: colors.danger,
  },
});
