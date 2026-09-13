import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import {
  PriorityPicker,
  describeTaskError,
  useTaskService,
  type PrioritySlot,
  type Task,
} from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

type ChangePriorityScreenProps = {
  taskId: string;
};

export function ChangePriorityScreen({ taskId }: ChangePriorityScreenProps) {
  const service = useTaskService();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [slots, setSlots] = useState<PrioritySlot[] | null>(null);
  const [priority, setPriority] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    const result = await service.getTask(taskId);
    if (!result.ok) {
      return { error: describeTaskError(result.error) } as const;
    }
    const nextSlots =
      result.value.scheduledDate === null
        ? null
        : await service.getPriorityAvailability(result.value.scheduledDate, {
            exceptTaskId: taskId,
          });
    return { task: result.value, slots: nextSlots } as const;
  }, [service, taskId]);

  const applyState = useCallback((state: Awaited<ReturnType<typeof fetchState>>) => {
    if ('error' in state) {
      setError(state.error);
      return;
    }
    setTask(state.task);
    setPriority(state.task.priority);
    setSlots(state.slots);
  }, []);

  const load = useCallback(async () => {
    applyState(await fetchState());
  }, [applyState, fetchState]);

  useEffect(() => {
    let active = true;
    void fetchState().then((state) => {
      if (active) {
        applyState(state);
      }
    });
    return () => {
      active = false;
    };
  }, [applyState, fetchState]);

  function close() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/task/${taskId}`);
    }
  }

  async function save() {
    if (task === null) {
      return;
    }
    const result =
      task.placementType === 'carryOver'
        ? await service.convertCarryOverToRanked(task.id, priority)
        : await service.changePriority(task.id, priority ?? Number.NaN);
    if (result.ok) {
      close();
      return;
    }
    setError(describeTaskError(result.error));
    if (result.error.type === 'PriorityConflict') {
      await load();
    }
  }

  const isScheduled = task !== null && task.scheduledDate !== null && task.status === 'active';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="change-priority"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {UI_STRINGS.reminderActions.changePriority}
      </Text>
      {task === null ? null : <Text style={styles.taskTitle}>{task.title}</Text>}
      {task !== null && !isScheduled ? (
        <Text style={styles.hint}>This task is not planned for a day.</Text>
      ) : null}
      {task?.placementType === 'carryOver' ? (
        <>
          <Text style={styles.megaCrush}>{UI_STRINGS.carryOverLabel}</Text>
          <TextButton label="Keep Mega Crush" onPress={close} />
        </>
      ) : null}
      {isScheduled && slots !== null ? (
        <PriorityPicker slots={slots} selected={priority} onSelect={setPriority} />
      ) : null}
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {isScheduled ? (
        <TextButton
          label="Save priority"
          variant="primary"
          disabled={priority === null}
          onPress={() => void save()}
        />
      ) : null}
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  taskTitle: {
    fontSize: 17,
    color: colors.text,
  },
  megaCrush: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  hint: {
    fontSize: 14,
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
