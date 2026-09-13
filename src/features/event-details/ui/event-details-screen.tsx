import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  EVENT_LABELS,
  describeEventError,
  eventStatus,
  formatCalendarDate,
  formatEventDates,
  formatEventTimes,
  useCalendarEventService,
  type CalendarEvent,
} from '@/entities/calendar-event';
import { formatMinutes } from '@/entities/task';
import { ReminderStatus } from '@/features/reminders';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { formatLocalTime } from '@/shared/lib/picker-values';
import { openAddressInMaps } from '@/shared/lib/open-maps';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

export const EVENT_DETAILS_TEXT = {
  mapsFailed: 'Could not open the address in Maps',
} as const;

type DetailsState =
  | { status: 'loading' }
  | { status: 'missing'; message: string }
  | { status: 'ready'; event: CalendarEvent };

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function EventDetailsScreen({ eventId }: { eventId: string }) {
  const events = useCalendarEventService();
  const router = useRouter();
  const [state, setState] = useState<DetailsState>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = () => {
        void events.getEvent(eventId).then((result) => {
          if (active) {
            setState(
              result.ok
                ? { status: 'ready', event: result.value }
                : { status: 'missing', message: describeEventError(result.error) },
            );
          }
        });
      };
      load();
      const unsubscribe = events.onChange(load);
      return () => {
        active = false;
        unsubscribe();
      };
    }, [events, eventId]),
  );

  async function toggleThing(index: number, checked: boolean) {
    const result = await events.setThingToTakeChecked(eventId, index, checked);
    if (result.ok) {
      setState({ status: 'ready', event: result.value });
      setError(null);
    } else {
      setError(describeEventError(result.error));
    }
  }

  async function openAddress(address: string) {
    const opened = await openAddressInMaps(address);
    setError(opened ? null : EVENT_DETAILS_TEXT.mapsFailed);
  }

  if (state.status === 'loading') {
    return <View style={styles.screen} />;
  }

  if (state.status === 'missing') {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.body}>{state.message}</Text>
      </View>
    );
  }

  const { event } = state;
  const timeZone = events.getTimeZone();
  const status = eventStatus(event, events.getNow(), timeZone);
  const reminder = event.reminder;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="event-details">
      <Text accessibilityRole="header" style={styles.title}>
        {event.title}
      </Text>
      <View style={styles.rows}>
        <DetailRow label="Date" value={formatEventDates(event, timeZone)} />
        {event.allDay ? (
          <Text style={styles.badge}>{EVENT_LABELS.allDay}</Text>
        ) : (
          <DetailRow label="Time" value={formatEventTimes(event, timeZone)} />
        )}
        {status === 'now' ? <Text style={styles.nowBadge}>{EVENT_LABELS.happeningNow}</Text> : null}
        {status === 'ended' ? <Text style={styles.muted}>{EVENT_LABELS.ended}</Text> : null}
      </View>
      {event.description === null ? null : (
        <Section title={UI_STRINGS.about}>
          <Text style={styles.body}>{event.description}</Text>
        </Section>
      )}
      <View style={styles.rows}>
        {event.address === null ? null : (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Address: ${event.address}`}
            accessibilityHint="Opens the address in Maps"
            onPress={() => void openAddress(event.address ?? '')}
            style={styles.row}
          >
            <Text style={styles.rowLabel}>Address</Text>
            <Text style={[styles.rowValue, styles.link]}>{event.address}</Text>
          </Pressable>
        )}
        {event.travelMinutes === null ? null : (
          <DetailRow label="Travel" value={formatMinutes(event.travelMinutes)} />
        )}
        {reminder === null ? null : (
          <DetailRow
            label="Reminder"
            value={`${formatCalendarDate(reminder.localDateTime.slice(0, 10))}, ${formatLocalTime(
              reminder.localDateTime.slice(11, 16),
            )}`}
          />
        )}
        {reminder === null ? null : <ReminderStatus event={event} />}
      </View>
      {event.thingsToTake.length === 0 ? null : (
        <Section title="Things to take">
          {event.thingsToTake.map((item, index) => (
            <Pressable
              key={`${index}:${item.text}`}
              accessibilityRole="checkbox"
              accessibilityLabel={item.text}
              accessibilityState={{ checked: item.checked }}
              onPress={() => void toggleThing(index, !item.checked)}
              style={styles.thing}
            >
              <Text style={styles.checkbox}>{item.checked ? '☑' : '☐'}</Text>
              <Text style={[styles.body, item.checked && styles.checked]}>{item.text}</Text>
            </Pressable>
          ))}
        </Section>
      )}
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <TextButton
        label={UI_STRINGS.edit}
        variant="primary"
        onPress={() => router.push(`/event/${event.id}/edit`)}
      />
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
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  body: {
    fontSize: 16,
    color: colors.text,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.muted,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 15,
    color: colors.text,
  },
  link: {
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  badge: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.event,
  },
  nowBadge: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.event,
  },
  muted: {
    fontSize: 15,
    color: colors.muted,
  },
  thing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    fontSize: 18,
    color: colors.accent,
  },
  checked: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
