import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  describeTaskError,
  useTaskService,
  type ScheduledTask,
  type TaskResult,
} from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import { withSentBackLast } from '../model/display-order';
import { useDeck } from '../model/use-deck';
import { DateSwitcher } from './date-switcher';
import { SwipeableTaskCard } from './swipeable-task-card';
import { UndoBar } from './undo-bar';

type Notice = {
  message: string;
  eventId: string | null;
};

type ActionResult = TaskResult<{ event: { id: string } }>;

export function TodayScreen() {
  const service = useTaskService();
  const router = useRouter();
  const today = useMemo(() => service.getToday(), [service]);
  const [date, setDate] = useState(today);
  const { deck, reload } = useDeck(date);
  const [sentBackIds, setSentBackIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [cardsVersion, setCardsVersion] = useState(0);

  const cards = useMemo(
    () => (deck === null ? null : withSentBackLast(deck, sentBackIds)),
    [deck, sentBackIds],
  );

  const settle = useCallback(
    async (result: ActionResult, label: string, task: ScheduledTask) => {
      await reload();
      if (result.ok) {
        setNotice({ message: `${label}: ${task.title}`, eventId: result.value.event.id });
        return;
      }
      setNotice({ message: describeTaskError(result.error), eventId: null });
      setCardsVersion((version) => version + 1);
    },
    [reload],
  );

  const handleDone = useCallback(
    async (task: ScheduledTask) => {
      await settle(await service.completeTask(task.id), UI_STRINGS.swipeRight, task);
    },
    [service, settle],
  );

  const handleSendBack = useCallback((task: ScheduledTask) => {
    setSentBackIds((ids) => [...ids, task.id]);
  }, []);

  const handleSentBack = useCallback(
    async (task: ScheduledTask) => {
      await settle(await service.postponeUntilTomorrow(task.id), UI_STRINGS.swipeLeft, task);
      setSentBackIds((ids) => ids.filter((id) => id !== task.id));
    },
    [service, settle],
  );

  const handleUndo = useCallback(async () => {
    if (notice === null || notice.eventId === null) {
      return;
    }
    const result = await service.undo(notice.eventId);
    await reload();
    setNotice(result.ok ? null : { message: describeTaskError(result.error), eventId: null });
  }, [notice, service, reload]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const openTask = useCallback(
    (task: ScheduledTask) => router.push(`/task/${task.id}`),
    [router],
  );

  const createTask = useCallback(
    () => router.push({ pathname: '/task/new', params: { date } }),
    [router, date],
  );

  const changeDate = useCallback((next: string) => {
    setSentBackIds([]);
    setDate(next);
  }, []);

  function renderDeck(tasks: ScheduledTask[]) {
    if (tasks.length === 0) {
      return (
        <View style={styles.empty} testID="empty-deck">
          <Text style={styles.emptyText}>No tasks for this day</Text>
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.list}>
        {tasks.map((task) => (
          <SwipeableTaskCard
            key={`${task.id}:${cardsVersion}`}
            task={task}
            phase={sentBackIds.includes(task.id) ? 'sendingBack' : 'idle'}
            onOpen={openTask}
            onDone={handleDone}
            onSendBack={handleSendBack}
            onSentBack={handleSentBack}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {UI_STRINGS.todayList}
        </Text>
        <TextButton label="New task" variant="primary" onPress={createTask} />
      </View>
      <View style={styles.dateRow}>
        <DateSwitcher date={date} today={today} onChange={changeDate} />
      </View>
      {cards === null ? null : renderDeck(cards)}
      {notice === null ? null : (
        <UndoBar
          message={notice.message}
          canUndo={notice.eventId !== null}
          onUndo={handleUndo}
          onDismiss={dismissNotice}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  dateRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 96,
    gap: spacing.md,
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
