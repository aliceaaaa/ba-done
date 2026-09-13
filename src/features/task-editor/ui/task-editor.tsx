import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  PriorityPicker,
  describeTaskError,
  formatTaskDate,
  useTaskService,
  type PrioritySlot,
  type Task,
  type TaskResult,
} from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { ChipRow, type ChipOption } from '@/shared/ui/chip-row';
import { DateSwitcher } from '@/shared/ui/date-switcher';
import { LabeledInput } from '@/shared/ui/labeled-input';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

import {
  allowsDatedReminder,
  createEditorValues,
  editorValuesFromTask,
  placementChangeFor,
  selectPlacementMode,
  toDetailsDraft,
  type EditorValues,
  type PlacementMode,
} from '../model/editor-values';
import { ThingsToTakeEditor } from './things-to-take-editor';
import { ReminderFields, TimeFields } from './time-and-reminder-fields';

const PLACEMENT_OPTIONS: readonly ChipOption<PlacementMode>[] = [
  { value: 'day', label: 'Day' },
  { value: 'future', label: 'Future' },
];

export type TaskEditorProps =
  | {
      mode: 'create';
      initialPlacement: PlacementMode;
      initialDate: string;
      onSaved: (task: Task) => void;
    }
  | {
      mode: 'edit';
      task: Task;
      onSaved: (task: Task) => void;
      onDeleted: () => void;
    };

export function TaskEditor(props: TaskEditorProps) {
  const service = useTaskService();
  const today = useMemo(() => service.getToday(), [service]);
  const editedTask = props.mode === 'edit' ? props.task : null;
  const initialValues = useMemo(
    () =>
      props.mode === 'edit'
        ? editorValuesFromTask(props.task, today)
        : createEditorValues(props.initialPlacement, props.initialDate),
    [props, today],
  );
  const [values, setValues] = useState<EditorValues>(initialValues);
  const [slots, setSlots] = useState<PrioritySlot[] | null>(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const exceptTaskId = editedTask?.id;
  const isMegaCrush = editedTask?.placementType === 'carryOver';

  useEffect(() => {
    if (values.placementMode !== 'day') {
      return;
    }
    let active = true;
    void service
      .getPriorityAvailability(
        values.scheduledDate,
        exceptTaskId === undefined ? {} : { exceptTaskId },
      )
      .then((next) => {
        if (active) {
          setSlots(next);
        }
      });
    return () => {
      active = false;
    };
  }, [service, values.placementMode, values.scheduledDate, exceptTaskId, slotsVersion]);

  function submit(clearReminder: boolean): Promise<TaskResult<Task>> {
    const initial = props.mode === 'edit' ? initialValues : null;
    const details = toDetailsDraft(values, initial);
    if (props.mode === 'edit') {
      return service.editTask(props.task.id, {
        ...details,
        placement: placementChangeFor(props.task, values, clearReminder),
      });
    }
    if (values.placementMode === 'future') {
      return service.createFutureTask(details);
    }
    return service.createTask({
      ...details,
      scheduledDate: values.scheduledDate,
      priority: values.priority,
    });
  }

  async function save(clearReminder = false) {
    setSaving(true);
    const result = await submit(clearReminder);
    setSaving(false);
    if (result.ok) {
      props.onSaved(result.value);
      return;
    }
    if (result.error.type === 'ReminderClearRequired') {
      Alert.alert('Move to Future?', 'The reminder of this task will be turned off.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn off and move', style: 'destructive', onPress: () => void save(true) },
      ]);
      return;
    }
    setError(describeTaskError(result.error));
    if (result.error.type === 'PriorityConflict') {
      setValues((current) => ({ ...current, priority: null }));
      setSlotsVersion((version) => version + 1);
    }
  }

  function confirmDelete() {
    if (props.mode !== 'edit') {
      return;
    }
    const { task, onDeleted } = props;
    Alert.alert('Delete task?', 'The task will be removed from all lists.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void service.deleteTask(task.id).then((result) => {
            if (result.ok) {
              onDeleted();
            } else {
              setError(describeTaskError(result.error));
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
      testID="task-editor"
    >
      <LabeledInput
        label="Title"
        value={values.title}
        onChangeText={(title) => setValues({ ...values, title })}
      />
      <LabeledInput
        label="Description"
        multiline
        value={values.description}
        onChangeText={(description) => setValues({ ...values, description })}
      />
      <View style={styles.group}>
        <Text style={styles.label}>Placement</Text>
        <ChipRow
          accessibilityLabel="Placement"
          options={PLACEMENT_OPTIONS}
          selected={values.placementMode}
          onSelect={(placementMode) => setValues(selectPlacementMode(values, placementMode))}
        />
        {values.placementMode === 'day' ? (
          <View style={styles.group}>
            <DateSwitcher
              date={values.scheduledDate}
              today={today}
              label={formatTaskDate(values.scheduledDate)}
              onChange={(scheduledDate) => setValues({ ...values, scheduledDate })}
            />
            {isMegaCrush ? (
              <View style={styles.megaCrush}>
                <Text style={styles.megaCrushLabel}>{UI_STRINGS.carryOverLabel}</Text>
                <Text style={styles.hint}>Choose a priority to make it a regular task.</Text>
              </View>
            ) : null}
            {slots === null ? null : (
              <PriorityPicker
                slots={slots}
                selected={values.priority}
                onSelect={(priority) => setValues({ ...values, priority })}
              />
            )}
          </View>
        ) : null}
      </View>
      <TimeFields values={values} onChange={setValues} />
      <LabeledInput
        label="Duration (min)"
        keyboardType="number-pad"
        value={values.durationMinutes}
        onChangeText={(durationMinutes) => setValues({ ...values, durationMinutes })}
      />
      <LabeledInput
        label="Address"
        value={values.address}
        onChangeText={(address) => setValues({ ...values, address })}
      />
      <LabeledInput
        label="Travel time (min)"
        keyboardType="number-pad"
        value={values.travelMinutes}
        onChangeText={(travelMinutes) => setValues({ ...values, travelMinutes })}
      />
      <ThingsToTakeEditor
        items={values.things}
        onChange={(things) => setValues({ ...values, things })}
      />
      <ReminderFields
        values={values}
        onChange={setValues}
        timeZone={service.getTimeZone()}
        allowDatedReminder={allowsDatedReminder(values.placementMode)}
      />
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <TextButton label="Save" variant="primary" disabled={saving} onPress={() => void save()} />
      {props.mode === 'edit' ? <TextButton label="Delete task" onPress={confirmDelete} /> : null}
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
  group: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  megaCrush: {
    gap: spacing.xs,
  },
  megaCrushLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
