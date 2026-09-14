import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { useLists } from '../model/use-list-data';
import { ListRow } from './list-row';

export const LISTS_TEXT = {
  title: 'Lists',
  newList: 'New list',
  archived: 'Archived lists',
  empty: 'No lists yet',
  emptyHint: 'Create a list for shopping, packing or anything else.',
  create: 'Create list',
  loading: 'Loading lists',
  error: 'Could not load your lists.',
  retry: 'Try again',
} as const;

export function ListsScreen() {
  const router = useRouter();
  const { state, retry } = useLists();

  function renderContent() {
    if (state.status === 'loading') {
      return <ActivityIndicator accessibilityLabel={LISTS_TEXT.loading} color={colors.accent} />;
    }
    if (state.status === 'error') {
      return (
        <View style={styles.state} accessibilityRole="alert">
          <Text style={styles.error}>{LISTS_TEXT.error}</Text>
          <TextButton label={LISTS_TEXT.retry} onPress={retry} />
        </View>
      );
    }
    if (state.value.length === 0) {
      return (
        <View style={styles.state} testID="empty-lists">
          <Text style={styles.emptyTitle}>{LISTS_TEXT.empty}</Text>
          <Text style={styles.hint}>{LISTS_TEXT.emptyHint}</Text>
          <TextButton label={LISTS_TEXT.create} variant="primary" onPress={() => router.push('/list/new')} />
        </View>
      );
    }
    return (
      <View style={styles.rows}>
        {state.value.map((list) => (
          <ListRow key={list.id} list={list} onPress={(item) => router.push(`/list/${item.id}`)} />
        ))}
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="lists">
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {LISTS_TEXT.title}
          </Text>
          <TextButton label={LISTS_TEXT.newList} variant="primary" onPress={() => router.push('/list/new')} />
        </View>
        {renderContent()}
        <TextButton label={LISTS_TEXT.archived} onPress={() => router.push('/list/archived')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 96,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  rows: {
    gap: spacing.md,
  },
  state: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  error: {
    fontSize: 15,
    color: colors.danger,
    textAlign: 'center',
  },
});
