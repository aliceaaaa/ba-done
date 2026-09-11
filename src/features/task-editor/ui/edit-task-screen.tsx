import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { describeTaskError, useTaskService, type Task } from '@/entities/task';
import { colors, spacing } from '@/shared/ui/theme';

import { TaskEditor } from './task-editor';

type EditTaskScreenProps = {
  taskId: string;
};

type LoadState =
  { status: 'loading' } | { status: 'missing'; message: string } | { status: 'ready'; task: Task };

export function EditTaskScreen({ taskId }: EditTaskScreenProps) {
  const service = useTaskService();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void service.getTask(taskId).then((result) => {
      if (active) {
        setState(
          result.ok
            ? { status: 'ready', task: result.value }
            : { status: 'missing', message: describeTaskError(result.error) },
        );
      }
    });
    return () => {
      active = false;
    };
  }, [service, taskId]);

  if (state.status === 'loading') {
    return <View style={styles.screen} />;
  }

  if (state.status === 'missing') {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.message}>{state.message}</Text>
      </View>
    );
  }

  return (
    <TaskEditor
      mode="edit"
      task={state.task}
      onSaved={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(`/task/${taskId}`);
        }
      }}
      onDeleted={() => {
        if (router.canDismiss()) {
          router.dismissAll();
        } else {
          router.replace('/');
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  message: {
    fontSize: 16,
    color: colors.text,
  },
});
