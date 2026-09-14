import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCalendarEventService } from '@/entities/calendar-event';
import { MicButton, useVoiceHint } from '@/features/voice';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { toLocalDate } from '@/shared/lib/local-date';
import { ChipRow, type ChipOption } from '@/shared/ui/chip-row';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import {
  CALENDAR_MODES,
  CALENDAR_MODE_LABELS,
  formatPeriodLabel,
  isSameMonth,
  monthGridDates,
  periodRange,
  shiftSelectedDate,
  weekDates,
  type CalendarMode,
} from '../model/calendar-period';
import { buildDayAgenda, countByDate, type DayCounts } from '../model/day-agenda';
import { useCalendarData } from '../model/use-calendar-data';
import { AgendaList } from './agenda-list';
import { DayCell } from './day-cell';

export const CALENDAR_TEXT = {
  title: 'Calendar',
  loading: 'Loading calendar',
  error: 'Could not load the calendar.',
  retry: 'Try again',
  emptyWeek: 'Nothing planned this week',
  emptyMonth: 'Nothing planned this month',
  create: 'Create',
  newTask: 'New task',
  newEvent: 'New event',
  cancel: 'Cancel',
  openDay: 'Open day',
  openInMatches: `Open in ${UI_STRINGS.todayList}`,
} as const;

const MODE_OPTIONS: readonly ChipOption<CalendarMode>[] = CALENDAR_MODES.map((mode) => ({
  value: mode,
  label: CALENDAR_MODE_LABELS[mode],
}));

const NO_COUNTS: DayCounts = { tasks: 0, events: 0 };

type CalendarScreenProps = {
  initialDate?: string | null;
};

export function CalendarScreen({ initialDate = null }: CalendarScreenProps) {
  const events = useCalendarEventService();
  const router = useRouter();
  const today = useMemo(() => toLocalDate(events.getNow(), events.getTimeZone()), [events]);
  const [date, setDate] = useState(initialDate ?? today);
  const [mode, setMode] = useState<CalendarMode>('day');
  const [creating, setCreating] = useState(false);
  const range = useMemo(() => periodRange(date, mode), [date, mode]);
  const { data, retry } = useCalendarData(range);
  const timeZone = events.getTimeZone();
  useVoiceHint({ kind: 'calendar', date });

  const counts = useMemo(
    () => (data.status === 'ready' ? countByDate(data.tasks, data.events, timeZone) : new Map()),
    [data, timeZone],
  );
  const agenda = useMemo(
    () =>
      data.status === 'ready'
        ? buildDayAgenda(date, data.tasks, data.events, timeZone, events.getNow())
        : null,
    [data, date, timeZone, events],
  );

  const modeLabel = CALENDAR_MODE_LABELS[mode].toLowerCase();

  function selectDate(next: string) {
    if (mode === 'month' && next === date) {
      setMode('day');
      return;
    }
    setDate(next);
  }

  function renderPeriodBody() {
    if (mode === 'week') {
      const dates = weekDates(date);
      const isEmpty = dates.every((day) => counts.get(day) === undefined);
      return (
        <View style={styles.group}>
          <View style={styles.weekRow} testID="week-strip">
            {dates.map((day) => (
              <DayCell
                key={day}
                date={day}
                counts={counts.get(day) ?? NO_COUNTS}
                selected={day === date}
                today={day === today}
                showWeekday
                onPress={selectDate}
              />
            ))}
          </View>
          {isEmpty ? <Text style={styles.emptyText}>{CALENDAR_TEXT.emptyWeek}</Text> : null}
        </View>
      );
    }
    if (mode === 'month') {
      const dates = monthGridDates(date);
      const isEmpty = dates.every(
        (day) => !isSameMonth(day, date) || counts.get(day) === undefined,
      );
      const weeks = Array.from({ length: dates.length / 7 }, (_, index) =>
        dates.slice(index * 7, index * 7 + 7),
      );
      return (
        <View style={styles.group}>
          <View style={styles.monthGrid} testID="month-grid">
            {weeks.map((week) => (
              <View key={week[0]} style={styles.weekRow}>
                {week.map((day) => (
                  <DayCell
                    key={day}
                    date={day}
                    counts={counts.get(day) ?? NO_COUNTS}
                    selected={day === date}
                    today={day === today}
                    muted={!isSameMonth(day, date)}
                    onPress={selectDate}
                  />
                ))}
              </View>
            ))}
          </View>
          {isEmpty ? <Text style={styles.emptyText}>{CALENDAR_TEXT.emptyMonth}</Text> : null}
          <TextButton label={CALENDAR_TEXT.openDay} onPress={() => setMode('day')} />
        </View>
      );
    }
    return null;
  }

  function renderContent() {
    if (data.status === 'loading') {
      return (
        <View style={styles.state}>
          <ActivityIndicator accessibilityLabel={CALENDAR_TEXT.loading} color={colors.accent} />
          <Text style={styles.emptyText}>{CALENDAR_TEXT.loading}</Text>
        </View>
      );
    }
    if (data.status === 'error' || agenda === null) {
      return (
        <View style={styles.state} accessibilityRole="alert">
          <Text style={styles.errorText}>{CALENDAR_TEXT.error}</Text>
          <TextButton label={CALENDAR_TEXT.retry} onPress={retry} />
        </View>
      );
    }
    return (
      <View style={styles.group}>
        {renderPeriodBody()}
        <View style={styles.agendaHeader}>
          <Text accessibilityRole="header" style={styles.agendaTitle}>
            {formatPeriodLabel(date, 'day')}
          </Text>
          <TextButton
            label={CALENDAR_TEXT.openInMatches}
            onPress={() => router.navigate({ pathname: '/', params: { date } })}
          />
        </View>
        <AgendaList
          agenda={agenda}
          onOpenTask={(task) => router.push(`/task/${task.id}`)}
          onOpenEvent={(item) => router.push(`/event/${item.event.id}`)}
        />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="calendar">
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {CALENDAR_TEXT.title}
          </Text>
          <View style={styles.headerActions}>
            <MicButton hint={{ kind: 'calendar', date }} testID="calendar-mic-button" />
            <TextButton
              label={CALENDAR_TEXT.create}
              variant="primary"
              onPress={() => setCreating((current) => !current)}
            />
          </View>
        </View>
        {creating ? (
          <View style={styles.createMenu} testID="create-menu">
            <TextButton
              label={CALENDAR_TEXT.newTask}
              onPress={() => {
                setCreating(false);
                router.push({ pathname: '/task/new', params: { date } });
              }}
            />
            <TextButton
              label={CALENDAR_TEXT.newEvent}
              onPress={() => {
                setCreating(false);
                router.push({ pathname: '/event/new', params: { date } });
              }}
            />
            <MicButton hint={{ kind: 'calendar', date }} testID="create-menu-mic-button" />
            <TextButton label={CALENDAR_TEXT.cancel} onPress={() => setCreating(false)} />
          </View>
        ) : null}
        <ChipRow
          accessibilityLabel="Calendar view"
          options={MODE_OPTIONS}
          selected={mode}
          onSelect={setMode}
        />
        <View style={styles.navigation}>
          <TextButton
            label="‹"
            accessibilityLabel={`Previous ${modeLabel}`}
            onPress={() => setDate(shiftSelectedDate(date, mode, -1))}
          />
          <Text style={styles.period} testID="calendar-period" accessibilityRole="text">
            {formatPeriodLabel(date, mode)}
          </Text>
          <TextButton
            label="›"
            accessibilityLabel={`Next ${modeLabel}`}
            onPress={() => setDate(shiftSelectedDate(date, mode, 1))}
          />
          <TextButton label="Today" onPress={() => setDate(today)} disabled={date === today} />
        </View>
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  createMenu: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.accentSurface,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  period: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  group: {
    gap: spacing.md,
  },
  weekRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  monthGrid: {
    gap: spacing.xs,
  },
  agendaHeader: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  agendaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  state: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: colors.danger,
    textAlign: 'center',
  },
});
