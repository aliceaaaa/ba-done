import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EVENT_LABELS } from '@/entities/calendar-event';
import { DAY_PERIOD_LABELS, taskTimeLabel, type ScheduledTask } from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { colors, spacing } from '@/shared/ui/theme';

import type { AgendaEventItem, DayAgenda } from '../model/day-agenda';

export const AGENDA_SECTION_TITLES = {
  allDay: 'All-day events',
  timed: 'Events',
  exactTime: 'Tasks at a set time',
  anyTime: 'Any time',
} as const;

export const EMPTY_DAY_TEXT = 'Nothing planned for this day';

type AgendaListProps = {
  agenda: DayAgenda;
  onOpenTask: (task: ScheduledTask) => void;
  onOpenEvent: (item: AgendaEventItem) => void;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function EventRow({ item, onPress }: { item: AgendaEventItem; onPress: () => void }) {
  const notes: string[] = [
    item.status === 'now' ? EVENT_LABELS.happeningNow : null,
    item.status === 'ended' ? EVENT_LABELS.ended : null,
    item.overlaps ? EVENT_LABELS.overlaps : null,
  ].filter((note): note is NonNullable<typeof note> => note !== null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`Event: ${item.event.title}`, item.timeLabel, ...notes].join(', ')}
      accessibilityHint="Opens event details"
      onPress={onPress}
      testID={`agenda-event-${item.event.id}`}
      style={({ pressed }) => [
        styles.row,
        styles.eventRow,
        item.status === 'ended' && styles.ended,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.title}>{item.event.title}</Text>
      <Text style={styles.meta}>{item.timeLabel}</Text>
      {notes.length === 0 ? null : (
        <View style={styles.notes}>
          {notes.map((note) => (
            <Text
              key={note}
              style={[styles.note, note === EVENT_LABELS.happeningNow && styles.nowNote]}
            >
              {note}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}

function TaskRow({ task, onPress }: { task: ScheduledTask; onPress: () => void }) {
  const time = taskTimeLabel(task);
  const badge =
    task.placementType === 'carryOver' ? UI_STRINGS.carryOverLabel : `Priority ${task.priority}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`Task: ${task.title}`, badge, time].filter(Boolean).join(', ')}
      accessibilityHint="Opens task details"
      onPress={onPress}
      testID={`agenda-task-${task.id}`}
      style={({ pressed }) => [styles.row, styles.taskRow, pressed && styles.pressed]}
    >
      <Text style={styles.title}>{task.title}</Text>
      <View style={styles.notes}>
        <Text style={[styles.badge, task.placementType === 'carryOver' && styles.megaCrush]}>
          {badge}
        </Text>
        {time === null ? null : <Text style={styles.meta}>{time}</Text>}
      </View>
    </Pressable>
  );
}

export function AgendaList({ agenda, onOpenTask, onOpenEvent }: AgendaListProps) {
  if (agenda.isEmpty) {
    return (
      <View style={styles.empty} testID="empty-agenda">
        <Text style={styles.emptyText}>{EMPTY_DAY_TEXT}</Text>
      </View>
    );
  }
  return (
    <View style={styles.list} testID={`agenda-${agenda.date}`}>
      {agenda.allDayEvents.length === 0 ? null : (
        <Section title={AGENDA_SECTION_TITLES.allDay}>
          {agenda.allDayEvents.map((item) => (
            <EventRow key={item.event.id} item={item} onPress={() => onOpenEvent(item)} />
          ))}
        </Section>
      )}
      {agenda.timedEvents.length === 0 ? null : (
        <Section title={AGENDA_SECTION_TITLES.timed}>
          {agenda.timedEvents.map((item) => (
            <EventRow key={item.event.id} item={item} onPress={() => onOpenEvent(item)} />
          ))}
        </Section>
      )}
      {agenda.exactTimeTasks.length === 0 ? null : (
        <Section title={AGENDA_SECTION_TITLES.exactTime}>
          {agenda.exactTimeTasks.map((task) => (
            <TaskRow key={task.id} task={task} onPress={() => onOpenTask(task)} />
          ))}
        </Section>
      )}
      {agenda.periodGroups.map((group) => (
        <Section key={group.period} title={DAY_PERIOD_LABELS[group.period]}>
          {group.tasks.map((task) => (
            <TaskRow key={task.id} task={task} onPress={() => onOpenTask(task)} />
          ))}
        </Section>
      ))}
      {agenda.anyTimeTasks.length === 0 ? null : (
        <Section title={AGENDA_SECTION_TITLES.anyTime}>
          {agenda.anyTimeTasks.map((task) => (
            <TaskRow key={task.id} task={task} onPress={() => onOpenTask(task)} />
          ))}
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  eventRow: {
    backgroundColor: colors.eventSurface,
    borderColor: colors.event,
    borderLeftWidth: 4,
  },
  taskRow: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  ended: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
  },
  notes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  note: {
    fontSize: 13,
    color: colors.muted,
  },
  nowNote: {
    color: colors.event,
    fontWeight: '700',
  },
  badge: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  megaCrush: {
    color: colors.accent,
  },
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
});
