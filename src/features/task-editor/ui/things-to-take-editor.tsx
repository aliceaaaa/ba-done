import { StyleSheet, Text, TextInput, View } from 'react-native';

import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { newThingDraft, type ThingDraft } from '../model/editor-values';

type ThingsToTakeEditorProps = {
  items: ThingDraft[];
  onChange: (items: ThingDraft[]) => void;
};

export function ThingsToTakeEditor({ items, onChange }: ThingsToTakeEditorProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>Things to take</Text>
      {items.map((item, index) => (
        <View key={item.key} style={styles.row}>
          <TextInput
            accessibilityLabel={`Item ${index + 1}`}
            value={item.text}
            onChangeText={(text) =>
              onChange(items.map((other) => (other.key === item.key ? { ...other, text } : other)))
            }
            placeholder="Item"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <TextButton
            label="Remove"
            accessibilityLabel={`Remove item ${index + 1}`}
            onPress={() => onChange(items.filter((other) => other.key !== item.key))}
          />
        </View>
      ))}
      <TextButton label="Add item" onPress={() => onChange([...items, newThingDraft()])} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
});
