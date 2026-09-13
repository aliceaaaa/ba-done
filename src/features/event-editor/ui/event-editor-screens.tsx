import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  describeEventError,
  useCalendarEventService,
  type CalendarEvent,
} from '@/entities/calendar-event';
import { colors, spacing } from '@/shared/ui/theme';

import { EventEditor } from './event-editor';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing'; message: string }
  | { status: 'ready'; event: CalendarEvent };

function useBackOr(fallback: string) {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  };
}

export function CreateEventScreen({ date }: { date: string }) {
  const router = useRouter();
  const close = useBackOr('/calendar');
  return (
    <EventEditor
      mode="create"
      initialDate={date}
      onCancel={close}
      onSaved={(event) => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(`/event/${event.id}`);
        }
      }}
    />
  );
}

export function EditEventScreen({ eventId }: { eventId: string }) {
  const events = useCalendarEventService();
  const router = useRouter();
  const close = useBackOr(`/event/${eventId}`);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void events.getEvent(eventId).then((result) => {
      if (active) {
        setState(
          result.ok
            ? { status: 'ready', event: result.value }
            : { status: 'missing', message: describeEventError(result.error) },
        );
      }
    });
    return () => {
      active = false;
    };
  }, [events, eventId]);

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
    <EventEditor
      mode="edit"
      event={state.event}
      onCancel={close}
      onSaved={close}
      onDeleted={() => {
        if (router.canDismiss()) {
          router.dismissAll();
        } else {
          router.replace('/calendar');
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
