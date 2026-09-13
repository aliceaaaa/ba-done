import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  useCalendarEventService,
  type CalendarEvent,
  type EventError,
  type EventField,
} from '@/entities/calendar-event';
import { ThingsToTakeEditor } from '@/features/task-editor';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { ChipRow, type ChipOption } from '@/shared/ui/chip-row';
import { DateTimeField } from '@/shared/ui/date-time-field';
import { LabeledInput } from '@/shared/ui/labeled-input';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import {
  changeEnd,
  changeStart,
  createEventEditorValues,
  eventEditorValuesFromEvent,
  setAllDay,
  setReminderEnabled,
  toEventInput,
  type EventEditorValues,
} from '../model/event-editor-values';

type ReminderChoice = 'none' | 'exact';

const REMINDER_OPTIONS: readonly ChipOption<ReminderChoice>[] = [
  { value: 'none', label: 'No reminder' },
  { value: 'exact', label: 'At a date and time' },
];

export type EventEditorProps =
  | {
      mode: 'create';
      initialDate: string;
      onSaved: (event: CalendarEvent) => void;
      onCancel: () => void;
    }
  | {
      mode: 'edit';
      event: CalendarEvent;
      onSaved: (event: CalendarEvent) => void;
      onCancel: () => void;
      onDeleted: () => void;
    };

type FieldErrors = Partial<Record<EventField, string>>;

function FieldError({ message }: { message: string | undefined }) {
  return message === undefined ? null : (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

export function EventEditor(props: EventEditorProps) {
  const events = useCalendarEventService();
  const timeZone = events.getTimeZone();
  const initialValues = useMemo(
    () =>
      props.mode === 'edit'
        ? eventEditorValuesFromEvent(props.event, timeZone)
        : createEventEditorValues(props.initialDate, events.getNow(), timeZone),
    [props, events, timeZone],
  );
  const [values, setValues] = useState<EventEditorValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function showError(error: EventError) {
    if (error.type !== 'ValidationError') {
      setFieldErrors({});
      setGeneralError(error.message);
      return;
    }
    const next: FieldErrors = {};
    for (const issue of error.issues) {
      next[issue.field] ??= issue.message;
    }
    setFieldErrors(next);
    setGeneralError(null);
  }

  async function save() {
    setSaving(true);
    const input = toEventInput(values, props.mode === 'edit' ? initialValues : null);
    const result =
      props.mode === 'edit'
        ? await events.updateEvent(props.event.id, input)
        : await events.createEvent(input);
    setSaving(false);
    if (result.ok) {
      props.onSaved(result.value);
      return;
    }
    showError(result.error);
  }

  function confirmDelete() {
    if (props.mode !== 'edit') {
      return;
    }
    const { event, onDeleted } = props;
    Alert.alert('Delete event?', 'The event will be removed from your calendar.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void events.deleteEvent(event.id).then((result) => {
            if (result.ok) {
              onDeleted();
            } else {
              showError(result.error);
            }
          });
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="event-editor"
    >
      <View style={styles.field}>
        <LabeledInput
          label="Title"
          value={values.title}
          onChangeText={(title) => setValues({ ...values, title })}
        />
        <FieldError message={fieldErrors.title} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>All day</Text>
        <Switch
          accessibilityLabel="All day"
          value={values.allDay}
          onValueChange={(allDay) => setValues(setAllDay(values, allDay))}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Start</Text>
        <View style={styles.pair}>
          <DateTimeField
            mode="date"
            label="Start date"
            value={values.startDate}
            onChange={(startDate) => setValues(changeStart(values, startDate, values.startTime))}
          />
          {values.allDay ? null : (
            <DateTimeField
              mode="time"
              label="Start time"
              value={values.startTime}
              onChange={(startTime) => setValues(changeStart(values, values.startDate, startTime))}
            />
          )}
        </View>
        <FieldError message={fieldErrors.start} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>End</Text>
        <View style={styles.pair}>
          <DateTimeField
            mode="date"
            label="End date"
            value={values.endDate}
            onChange={(endDate) => setValues(changeEnd(values, endDate, values.endTime))}
          />
          {values.allDay ? null : (
            <DateTimeField
              mode="time"
              label="End time"
              value={values.endTime}
              onChange={(endTime) => setValues(changeEnd(values, values.endDate, endTime))}
            />
          )}
        </View>
        <FieldError message={fieldErrors.end} />
      </View>
      <LabeledInput
        label={UI_STRINGS.about}
        multiline
        value={values.description}
        onChangeText={(description) => setValues({ ...values, description })}
      />
      <LabeledInput
        label="Address"
        value={values.address}
        onChangeText={(address) => setValues({ ...values, address })}
      />
      <View style={styles.field}>
        <LabeledInput
          label="Travel time (min)"
          keyboardType="number-pad"
          value={values.travelMinutes}
          onChangeText={(travelMinutes) => setValues({ ...values, travelMinutes })}
        />
        <FieldError message={fieldErrors.travelMinutes} />
      </View>
      <ThingsToTakeEditor
        items={values.things}
        onChange={(things) => setValues({ ...values, things })}
      />
      <View style={styles.field}>
        <Text style={styles.label}>Reminder</Text>
        <ChipRow
          accessibilityLabel="Reminder"
          options={REMINDER_OPTIONS}
          selected={values.reminderEnabled ? 'exact' : 'none'}
          onSelect={(choice) => setValues(setReminderEnabled(values, choice === 'exact'))}
        />
        {values.reminderEnabled ? (
          <View style={styles.pair}>
            <DateTimeField
              mode="date"
              label="Reminder date"
              value={values.reminderDate}
              onChange={(reminderDate) => setValues({ ...values, reminderDate })}
            />
            <DateTimeField
              mode="time"
              label="Reminder time"
              value={values.reminderTime}
              onChange={(reminderTime) => setValues({ ...values, reminderTime })}
            />
          </View>
        ) : null}
        <FieldError message={fieldErrors.reminder} />
      </View>
      {generalError === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {generalError}
        </Text>
      )}
      <View style={styles.actions}>
        <TextButton label="Cancel" onPress={props.onCancel} />
        <TextButton label="Save" variant="primary" disabled={saving} onPress={() => void save()} />
      </View>
      {props.mode === 'edit' ? <TextButton label="Delete event" onPress={confirmDelete} /> : null}
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
    paddingBottom: 48,
  },
  field: {
    gap: spacing.xs,
  },
  pair: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 16,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
