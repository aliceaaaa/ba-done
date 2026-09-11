import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { describeTaskError, useTaskService } from '@/entities/task';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { toTaskInput, valuesFromTask, type TaskFormValues } from '../model/task-form-values';
import { TaskFormFields } from './task-form-fields';

type EditTaskScreenProps = {
  taskId: string;
};

export function EditTaskScreen({ taskId }: EditTaskScreenProps) {
  const service = useTaskService();
  const router = useRouter();
  const [values, setValues] = useState<TaskFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void service.getTask(taskId).then((result) => {
      if (!active) {
        return;
      }
      if (result.ok) {
        setValues(valuesFromTask(result.value));
      } else {
        setError(describeTaskError(result.error));
      }
    });
    return () => {
      active = false;
    };
  }, [service, taskId]);

  async function save(current: TaskFormValues) {
    setSaving(true);
    const result = await service.updateTask(taskId, toTaskInput(current));
    setSaving(false);
    if (result.ok) {
      router.back();
      return;
    }
    setError(describeTaskError(result.error));
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {values === null ? null : <TaskFormFields values={values} onChange={setValues} />}
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {values === null ? null : (
        <TextButton
          label="Save"
          variant="primary"
          disabled={saving}
          onPress={() => void save(values)}
        />
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
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
