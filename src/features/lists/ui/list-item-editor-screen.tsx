import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  describeListError,
  parseQuantityText,
  useListService,
  type ListField,
  type ListItem,
} from '@/entities/list';
import { LabeledInput } from '@/shared/ui/labeled-input';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

export const ITEM_EDITOR_TEXT = {
  title: 'Title',
  quantity: 'Quantity',
  unit: 'Unit',
  note: 'Note',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete item',
  deleteTitle: 'Delete item?',
  deleteMessage: 'The item will be removed from this list.',
  saveFailed: 'Could not save. Try again.',
  missing: 'This item no longer exists.',
  quantityNotNumber: 'Enter the quantity as a number',
} as const;

type Values = {
  title: string;
  quantity: string;
  unit: string;
  note: string;
};

export function ListItemEditorScreen({ itemId }: { itemId: string }) {
  const service = useListService();
  const router = useRouter();
  const [item, setItem] = useState<ListItem | null>(null);
  const [missing, setMissing] = useState(false);
  const [values, setValues] = useState<Values>({ title: '', quantity: '', unit: '', note: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ListField, string>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void service
      .getItem(itemId)
      .then((result) => {
        if (!active) {
          return;
        }
        if (!result.ok) {
          setMissing(true);
          return;
        }
        setItem(result.value);
        setValues({
          title: result.value.title,
          quantity: result.value.quantity === null ? '' : String(result.value.quantity),
          unit: result.value.unit ?? '',
          note: result.value.note ?? '',
        });
      })
      .catch(() => active && setError(ITEM_EDITOR_TEXT.saveFailed));
    return () => {
      active = false;
    };
  }, [service, itemId]);

  function close() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(item === null ? '/lists' : `/list/${item.listId}`);
    }
  }

  async function save() {
    const quantity = parseQuantityText(values.quantity);
    if (quantity === 'invalid') {
      setFieldErrors({ quantity: ITEM_EDITOR_TEXT.quantityNotNumber });
      return;
    }
    setError(null);
    try {
      const result = await service.updateItem(itemId, {
        title: values.title,
        quantity,
        unit: values.unit,
        note: values.note,
      });
      if (result.ok) {
        close();
        return;
      }
      if (result.error.type === 'ValidationError') {
        const next: Partial<Record<ListField, string>> = {};
        for (const issue of result.error.issues) {
          next[issue.field] ??= issue.message;
        }
        setFieldErrors(next);
      } else {
        setFieldErrors({});
        setError(describeListError(result.error));
      }
    } catch {
      setError(ITEM_EDITOR_TEXT.saveFailed);
    }
  }

  function confirmDelete() {
    Alert.alert(ITEM_EDITOR_TEXT.deleteTitle, ITEM_EDITOR_TEXT.deleteMessage, [
      { text: ITEM_EDITOR_TEXT.cancel, style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void service
            .deleteItem(itemId)
            .then((result) => (result.ok ? close() : setError(describeListError(result.error))))
            .catch(() => setError(ITEM_EDITOR_TEXT.saveFailed));
        },
      },
    ]);
  }

  if (missing) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.message}>{ITEM_EDITOR_TEXT.missing}</Text>
      </View>
    );
  }

  if (item === null) {
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
      testID="list-item-editor"
    >
      <View style={styles.field}>
        <LabeledInput
          label={ITEM_EDITOR_TEXT.title}
          value={values.title}
          onChangeText={(title) => setValues({ ...values, title })}
        />
        {fieldErrors.title === undefined ? null : (
          <Text accessibilityRole="alert" style={styles.error}>
            {fieldErrors.title}
          </Text>
        )}
      </View>
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <LabeledInput
            label={ITEM_EDITOR_TEXT.quantity}
            keyboardType="decimal-pad"
            value={values.quantity}
            onChangeText={(quantity) => setValues({ ...values, quantity })}
          />
          {fieldErrors.quantity === undefined ? null : (
            <Text accessibilityRole="alert" style={styles.error}>
              {fieldErrors.quantity}
            </Text>
          )}
        </View>
        <View style={styles.pairItem}>
          <LabeledInput
            label={ITEM_EDITOR_TEXT.unit}
            value={values.unit}
            onChangeText={(unit) => setValues({ ...values, unit })}
          />
        </View>
      </View>
      <LabeledInput
        label={ITEM_EDITOR_TEXT.note}
        multiline
        value={values.note}
        onChangeText={(note) => setValues({ ...values, note })}
      />
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <View style={styles.actions}>
        <TextButton label={ITEM_EDITOR_TEXT.cancel} onPress={close} />
        <TextButton label={ITEM_EDITOR_TEXT.save} variant="primary" onPress={() => void save()} />
      </View>
      <TextButton label={ITEM_EDITOR_TEXT.delete} onPress={confirmDelete} />
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
    gap: spacing.xs,
  },
  pair: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  pairItem: {
    flexGrow: 1,
    flexBasis: 140,
    gap: spacing.xs,
  },
  message: {
    fontSize: 16,
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
});
