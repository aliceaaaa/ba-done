import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  LIST_COLORS,
  LIST_COLOR_LABELS,
  LIST_COLOR_VALUES,
  LIST_ICONS,
  LIST_ICON_LABELS,
  LIST_ICON_SYMBOLS,
  LIST_KIND_LABELS,
  describeListError,
  useListService,
  type List,
  type ListColor,
  type ListError,
  type ListIcon,
  type ListKind,
} from '@/entities/list';
import { ChipRow, type ChipOption } from '@/shared/ui/chip-row';
import { LabeledInput } from '@/shared/ui/labeled-input';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

export const LIST_EDITOR_TEXT = {
  title: 'Title',
  kind: 'Type',
  color: 'Color',
  icon: 'Icon',
  save: 'Save',
  cancel: 'Cancel',
  archive: 'Archive list',
  restore: 'Restore list',
  delete: 'Delete list',
  deleteTitle: 'Delete list?',
  deleteMessage: 'The list and its items will be removed.',
  saveFailed: 'Could not save. Try again.',
  missing: 'This list no longer exists.',
} as const;

const KIND_OPTIONS: readonly ChipOption<ListKind>[] = (['custom', 'shopping'] as const).map(
  (kind) => ({
    value: kind,
    label: LIST_KIND_LABELS[kind],
  }),
);

type ListEditorScreenProps = { mode: 'create' } | { mode: 'edit'; listId: string };

type Values = {
  title: string;
  kind: ListKind;
  color: ListColor;
  icon: ListIcon;
};

export function ListEditorScreen(props: ListEditorScreenProps) {
  const service = useListService();
  const router = useRouter();
  const editId = props.mode === 'edit' ? props.listId : null;
  const [list, setList] = useState<List | null>(null);
  const [missing, setMissing] = useState(false);
  const [values, setValues] = useState<Values>({
    title: '',
    kind: 'custom',
    color: 'blue',
    icon: 'checklist',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editId === null) {
      return;
    }
    let active = true;
    void service
      .getList(editId)
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.ok) {
          setList(result.value);
          setValues({
            title: result.value.title,
            kind: result.value.kind,
            color: result.value.color,
            icon: result.value.icon,
          });
        } else {
          setMissing(true);
        }
      })
      .catch(() => active && setError(LIST_EDITOR_TEXT.saveFailed));
    return () => {
      active = false;
    };
  }, [service, editId]);

  function close() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/lists');
    }
  }

  async function run<T>(
    work: () => Promise<{ ok: true; value: T } | { ok: false; error: ListError }>,
  ) {
    setError(null);
    setSaving(true);
    try {
      const result = await work();
      if (!result.ok) {
        setError(describeListError(result.error));
        return null;
      }
      return result.value;
    } catch {
      setError(LIST_EDITOR_TEXT.saveFailed);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (editId === null) {
      const created = await run(() => service.createList(values));
      if (created !== null) {
        router.replace(`/list/${created.id}`);
      }
      return;
    }
    const updated = await run(() =>
      service.updateList(editId, { title: values.title, color: values.color, icon: values.icon }),
    );
    if (updated !== null) {
      close();
    }
  }

  function confirmDelete() {
    if (editId === null) {
      return;
    }
    Alert.alert(LIST_EDITOR_TEXT.deleteTitle, LIST_EDITOR_TEXT.deleteMessage, [
      { text: LIST_EDITOR_TEXT.cancel, style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void run(() => service.deleteList(editId)).then((deleted) => {
            if (deleted !== null) {
              if (router.canDismiss()) {
                router.dismissAll();
              }
              router.replace('/lists');
            }
          });
        },
      },
    ]);
  }

  if (missing) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.label}>{LIST_EDITOR_TEXT.missing}</Text>
      </View>
    );
  }

  if (editId !== null && list === null) {
    return (
      <View style={[styles.screen, styles.content]}>
        {error === null ? null : (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="list-editor"
    >
      <LabeledInput
        label={LIST_EDITOR_TEXT.title}
        value={values.title}
        onChangeText={(title) => setValues({ ...values, title })}
        returnKeyType="done"
        onSubmitEditing={() => void save()}
      />
      {editId === null ? (
        <View style={styles.field}>
          <Text style={styles.label}>{LIST_EDITOR_TEXT.kind}</Text>
          <ChipRow
            accessibilityLabel={LIST_EDITOR_TEXT.kind}
            options={KIND_OPTIONS}
            selected={values.kind}
            onSelect={(kind) =>
              setValues({
                ...values,
                kind,
                ...(kind === 'shopping' ? { icon: 'cart', color: 'green' } : {}),
              })
            }
          />
        </View>
      ) : null}
      <View style={styles.field}>
        <Text style={styles.label}>{LIST_EDITOR_TEXT.color}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={LIST_EDITOR_TEXT.color}
          style={styles.options}
        >
          {LIST_COLORS.map((color) => {
            const selected = values.color === color;
            return (
              <Pressable
                key={color}
                accessibilityRole="radio"
                accessibilityLabel={LIST_COLOR_LABELS[color]}
                accessibilityState={{ selected }}
                onPress={() => setValues({ ...values, color })}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <View style={[styles.swatch, { backgroundColor: LIST_COLOR_VALUES[color] }]} />
                <Text style={styles.optionText}>
                  {selected ? '✓ ' : ''}
                  {LIST_COLOR_LABELS[color]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{LIST_EDITOR_TEXT.icon}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={LIST_EDITOR_TEXT.icon}
          style={styles.options}
        >
          {LIST_ICONS.map((icon) => {
            const selected = values.icon === icon;
            return (
              <Pressable
                key={icon}
                accessibilityRole="radio"
                accessibilityLabel={LIST_ICON_LABELS[icon]}
                accessibilityState={{ selected }}
                onPress={() => setValues({ ...values, icon })}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={styles.optionText}>
                  {LIST_ICON_SYMBOLS[icon]} {selected ? '✓ ' : ''}
                  {LIST_ICON_LABELS[icon]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <View style={styles.actions}>
        <TextButton label={LIST_EDITOR_TEXT.cancel} onPress={close} />
        <TextButton
          label={LIST_EDITOR_TEXT.save}
          variant="primary"
          disabled={saving}
          onPress={() => void save()}
        />
      </View>
      {list === null ? null : (
        <View style={styles.danger}>
          {list.archivedAt === null ? (
            <TextButton
              label={LIST_EDITOR_TEXT.archive}
              onPress={() =>
                void run(() => service.archiveList(list.id)).then((archived) => {
                  if (archived !== null) {
                    router.replace('/lists');
                  }
                })
              }
            />
          ) : (
            <TextButton
              label={LIST_EDITOR_TEXT.restore}
              onPress={() =>
                void run(() => service.restoreList(list.id)).then(
                  (restored) => restored !== null && close(),
                )
              }
            />
          )}
          <TextButton label={LIST_EDITOR_TEXT.delete} onPress={confirmDelete} />
        </View>
      )}
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
    gap: spacing.lg,
    paddingBottom: 96,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  optionSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  optionText: {
    fontSize: 14,
    color: colors.text,
  },
  error: {
    fontSize: 14,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  danger: {
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
});
