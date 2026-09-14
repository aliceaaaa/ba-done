import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  formatTaskDate,
  taskTimeLabel,
  useTaskService,
  type FutureTask,
  type RankedTask,
} from '@/entities/task';
import { MicButton, useVoiceHint } from '@/features/voice';
import { NoticeBar } from '@/shared/ui/notice-bar';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { SchedulePanel } from './schedule-panel';

type ScheduledNotice = {
  message: string;
  date: string;
};

export function FuturePoolScreen() {
  const service = useTaskService();
  const router = useRouter();
  const today = useMemo(() => service.getToday(), [service]);
  const [tasks, setTasks] = useState<FutureTask[] | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ScheduledNotice | null>(null);
  useVoiceHint({ kind: 'futureTask' });

  const reload = useCallback(async () => {
    setTasks(await service.getFuturePool());
  }, [service]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => service.onChange(() => void reload()), [service, reload]);

  const handleScheduled = useCallback(
    async (task: RankedTask) => {
      setSchedulingId(null);
      await reload();
      setNotice({
        message: `Scheduled for ${formatTaskDate(task.scheduledDate)}: ${task.title}`,
        date: task.scheduledDate,
      });
    },
    [reload],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  function renderTask(task: FutureTask) {
    const time = taskTimeLabel(task);
    return (
      <View key={task.id} style={styles.card} testID={`future-task-${task.id}`}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens task details"
          onPress={() => router.push(`/task/${task.id}`)}
          testID={`open-task-${task.id}`}
        >
          <Text style={styles.title}>{task.title}</Text>
          {time === null ? null : <Text style={styles.meta}>{time}</Text>}
        </Pressable>
        {schedulingId === task.id ? (
          <SchedulePanel
            task={task}
            today={today}
            onScheduled={(scheduled) => void handleScheduled(scheduled)}
            onCancel={() => setSchedulingId(null)}
          />
        ) : (
          <View style={styles.actions}>
            <TextButton
              label="Schedule"
              accessibilityLabel={`Schedule ${task.title}`}
              onPress={() => setSchedulingId(task.id)}
            />
          </View>
        )}
      </View>
    );
  }

  function renderList(list: FutureTask[]) {
    if (list.length === 0) {
      return (
        <View style={styles.empty} testID="empty-future-pool">
          <Text style={styles.emptyText}>No tasks without a date</Text>
        </View>
      );
    }
    return <ScrollView contentContainerStyle={styles.list}>{list.map(renderTask)}</ScrollView>;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <MicButton hint={{ kind: 'futureTask' }} />
        <TextButton
          label="New Future task"
          variant="primary"
          onPress={() => router.push({ pathname: '/task/new', params: { placement: 'future' } })}
        />
      </View>
      {tasks === null ? null : renderList(tasks)}
      {notice === null ? null : (
        <NoticeBar
          message={notice.message}
          actionLabel="Go to day"
          onAction={() => {
            const { date } = notice;
            setNotice(null);
            router.navigate({ pathname: '/', params: { date } });
          }}
          onDismiss={dismissNotice}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 96,
    gap: spacing.md,
  },
  card: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 15,
    color: colors.muted,
  },
});
