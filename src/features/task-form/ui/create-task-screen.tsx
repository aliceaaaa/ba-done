import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  describeTaskError,
  formatTaskDate,
  useTaskService,
  type PrioritySlot,
} from '@/entities/task';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { EMPTY_TASK_FORM, toTaskInput, type TaskFormValues } from '../model/task-form-values';
import { PriorityPicker } from './priority-picker';
import { TaskFormFields } from './task-form-fields';

type CreateTaskScreenProps = {
  date: string;
};

export function CreateTaskScreen({ date }: CreateTaskScreenProps) {
  const service = useTaskService();
  const router = useRouter();
  const [values, setValues] = useState<TaskFormValues>(EMPTY_TASK_FORM);
  const [slots, setSlots] = useState<PrioritySlot[] | null>(null);
  const [priority, setPriority] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSlots = useCallback(async () => {
    setSlots(await service.getPriorityAvailability(date));
  }, [service, date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function save() {
    if (priority === null) {
      setError('Choose a free priority');
      return;
    }
    setSaving(true);
    const result = await service.createTask({ ...toTaskInput(values), scheduledDate: date, priority });
    setSaving(false);
    if (result.ok) {
      router.back();
      return;
    }
    setError(describeTaskError(result.error));
    if (result.error.type === 'PriorityConflict') {
      setPriority(null);
      await loadSlots();
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.date}>{formatTaskDate(date)}</Text>
      <View style={styles.group}>
        <Text style={styles.label}>Priority</Text>
        {slots === null ? null : (
          <PriorityPicker slots={slots} selected={priority} onSelect={setPriority} />
        )}
      </View>
      <TaskFormFields values={values} onChange={setValues} />
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <TextButton label="Save" variant="primary" disabled={saving} onPress={() => void save()} />
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
  },
  date: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  group: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
