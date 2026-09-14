import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { describeListError, useListService, type ListItem } from '@/entities/list';
import { MicButton, useVoiceHint } from '@/features/voice';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { useListDetails, type ListDetails } from '../model/use-list-data';
import { ListItemRow } from './list-item-row';

export const LIST_TEXT = {
  addPlaceholder: 'Add item',
  add: 'Add',
  empty: 'This list is empty. Type an item or use the microphone.',
  completed: 'Completed',
  clearCompleted: 'Clear completed',
  clearTitle: 'Clear completed items?',
  clearMessage: 'Checked items will be removed from this list.',
  deleteTitle: 'Delete item?',
  deleteMessage: 'The item will be removed from this list.',
  cancel: 'Cancel',
  delete: 'Delete',
  clear: 'Clear',
  editList: 'Edit list',
  archived: 'This list is archived. Restore it to change items.',
  restore: 'Restore',
  saveFailed: 'Could not save. Try again.',
  loadFailed: 'Could not load this list.',
  missing: 'This list no longer exists.',
  retry: 'Try again',
  loading: 'Loading list',
} as const;

type ListScreenProps = {
  listId: string;
};

export function ListScreen({ listId }: ListScreenProps) {
  const service = useListService();
  const router = useRouter();
  const { state, setState, reload, retry } = useListDetails(listId);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const input = useRef<TextInput>(null);
  useVoiceHint({ kind: 'listItem', listId });

  async function guarded(work: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setError(null);
    try {
      const result = await work();
      if (!result.ok) {
        setError(result.error?.message ?? LIST_TEXT.saveFailed);
      }
      return result.ok;
    } catch {
      setError(LIST_TEXT.saveFailed);
      await reload();
      return false;
    }
  }

  async function addItem() {
    const title = draft.trim();
    if (title.length === 0 || adding) {
      input.current?.focus();
      return;
    }
    setAdding(true);
    const added = await guarded(() => service.addItem(listId, { title }));
    setAdding(false);
    if (added) {
      setDraft('');
    }
    input.current?.focus();
  }

  function replaceItem(details: NonNullable<ListDetails>, item: ListItem) {
    const without = {
      active: details.items.active.filter((candidate) => candidate.id !== item.id),
      completed: details.items.completed.filter((candidate) => candidate.id !== item.id),
    };
    return {
      ...details,
      items: item.checked
        ? { ...without, completed: [item, ...without.completed] }
        : { ...without, active: [...without.active, item] },
    };
  }

  async function toggle(item: ListItem) {
    if (state.status !== 'ready' || state.value === null) {
      return;
    }
    const previous = state.value;
    setState({
      status: 'ready',
      value: replaceItem(previous, { ...item, checked: !item.checked }),
    });
    setError(null);
    try {
      const result = await service.setItemChecked(item.id, !item.checked);
      if (!result.ok) {
        setState({ status: 'ready', value: previous });
        setError(describeListError(result.error));
      }
    } catch {
      setState({ status: 'ready', value: previous });
      setError(LIST_TEXT.saveFailed);
    }
  }

  function confirmDelete(item: ListItem) {
    Alert.alert(LIST_TEXT.deleteTitle, LIST_TEXT.deleteMessage, [
      { text: LIST_TEXT.cancel, style: 'cancel' },
      {
        text: LIST_TEXT.delete,
        style: 'destructive',
        onPress: () => void guarded(() => service.deleteItem(item.id)),
      },
    ]);
  }

  function confirmClear() {
    Alert.alert(LIST_TEXT.clearTitle, LIST_TEXT.clearMessage, [
      { text: LIST_TEXT.cancel, style: 'cancel' },
      {
        text: LIST_TEXT.clear,
        style: 'destructive',
        onPress: () => void guarded(() => service.clearCompleted(listId)),
      },
    ]);
  }

  if (state.status === 'loading') {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator accessibilityLabel={LIST_TEXT.loading} color={colors.accent} />
      </View>
    );
  }
  if (state.status === 'error' || state.value === null) {
    return (
      <View style={[styles.screen, styles.center]} accessibilityRole="alert">
        <Text style={styles.errorText}>
          {state.status === 'error' ? LIST_TEXT.loadFailed : LIST_TEXT.missing}
        </Text>
        {state.status === 'error' ? <TextButton label={LIST_TEXT.retry} onPress={retry} /> : null}
      </View>
    );
  }

  const { list, items } = state.value;
  const archived = list.archivedAt !== null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
    >
      <Stack.Screen options={{ title: list.title }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID={`list-screen-${list.id}`}
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {list.title}
          </Text>
          <TextButton
            label={LIST_TEXT.editList}
            onPress={() => router.push(`/list/${list.id}/edit`)}
          />
        </View>

        {archived ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Text style={styles.bannerText}>{LIST_TEXT.archived}</Text>
            <TextButton
              label={LIST_TEXT.restore}
              onPress={() => void guarded(() => service.restoreList(list.id))}
            />
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              ref={input}
              accessibilityLabel={LIST_TEXT.addPlaceholder}
              placeholder={LIST_TEXT.addPlaceholder}
              placeholderTextColor={colors.muted}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => void addItem()}
              returnKeyType="done"
              submitBehavior="submit"
              autoCapitalize="sentences"
              style={styles.input}
            />
            <TextButton label={LIST_TEXT.add} variant="primary" onPress={() => void addItem()} />
            <MicButton hint={{ kind: 'listItem', listId: list.id }} />
          </View>
        )}

        {error === null ? null : (
          <Text accessibilityRole="alert" style={styles.errorText} testID="list-error">
            {error}
          </Text>
        )}

        {items.active.length === 0 && items.completed.length === 0 ? (
          <Text style={styles.empty}>{LIST_TEXT.empty}</Text>
        ) : null}

        <View testID="active-items">
          {items.active.map((item, index) => (
            <ListItemRow
              key={item.id}
              item={item}
              readOnly={archived}
              canMoveUp={index > 0}
              canMoveDown={index < items.active.length - 1}
              onToggle={(target) => void toggle(target)}
              onEdit={(target) => router.push(`/list-item/${target.id}`)}
              onDelete={confirmDelete}
              onMove={(target, direction) =>
                void guarded(() => service.moveItem(target.id, direction))
              }
            />
          ))}
        </View>

        {items.completed.length === 0 ? null : (
          <View style={styles.completed}>
            <View style={styles.completedHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${LIST_TEXT.completed}, ${items.completed.length}`}
                accessibilityState={{ expanded: completedOpen }}
                onPress={() => setCompletedOpen((open) => !open)}
                hitSlop={spacing.sm}
              >
                <Text style={styles.completedTitle}>
                  {completedOpen ? '▾' : '▸'} {LIST_TEXT.completed} ({items.completed.length})
                </Text>
              </Pressable>
              {archived ? null : (
                <TextButton label={LIST_TEXT.clearCompleted} onPress={confirmClear} />
              )}
            </View>
            {completedOpen ? (
              <View testID="completed-items">
                {items.completed.map((item) => (
                  <ListItemRow
                    key={item.id}
                    item={item}
                    readOnly={archived}
                    canMoveUp={false}
                    canMoveDown={false}
                    onToggle={(target) => void toggle(target)}
                    onEdit={(target) => router.push(`/list-item/${target.id}`)}
                    onDelete={confirmDelete}
                    onMove={() => undefined}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 160,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  inputRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flexGrow: 1,
    flexBasis: 180,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  banner: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
  },
  bannerText: {
    fontSize: 15,
    color: colors.text,
  },
  empty: {
    fontSize: 15,
    color: colors.muted,
  },
  errorText: {
    fontSize: 15,
    color: colors.danger,
  },
  completed: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  completedHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
