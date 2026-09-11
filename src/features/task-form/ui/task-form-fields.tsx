import { StyleSheet, Text, View } from 'react-native';

import { DAY_PERIOD_LABELS, DAY_PERIODS, type DayPeriod } from '@/entities/task';
import { ChipRow, type ChipOption } from '@/shared/ui/chip-row';
import { LabeledInput } from '@/shared/ui/labeled-input';
import { colors, spacing } from '@/shared/ui/theme';

import type { TaskFormValues, TimeMode } from '../model/task-form-values';

const TIME_MODE_OPTIONS: readonly ChipOption<TimeMode>[] = [
  { value: 'none', label: 'No time' },
  { value: 'exact', label: 'Exact time' },
  { value: 'period', label: 'Time of day' },
];

const DAY_PERIOD_OPTIONS: readonly ChipOption<DayPeriod>[] = DAY_PERIODS.map((period) => ({
  value: period,
  label: DAY_PERIOD_LABELS[period],
}));

type TaskFormFieldsProps = {
  values: TaskFormValues;
  onChange: (values: TaskFormValues) => void;
};

export function TaskFormFields({ values, onChange }: TaskFormFieldsProps) {
  function update<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <View style={styles.fields}>
      <LabeledInput
        label="Title"
        value={values.title}
        onChangeText={(text) => update('title', text)}
      />
      <LabeledInput
        label="Description"
        multiline
        value={values.description}
        onChangeText={(text) => update('description', text)}
      />
      <View style={styles.group}>
        <Text style={styles.label}>Time</Text>
        <ChipRow
          accessibilityLabel="Time"
          options={TIME_MODE_OPTIONS}
          selected={values.timeMode}
          onSelect={(mode) => update('timeMode', mode)}
        />
        {values.timeMode === 'exact' ? (
          <LabeledInput
            label="Exact time"
            placeholder="HH:mm"
            keyboardType="numbers-and-punctuation"
            value={values.exactTime}
            onChangeText={(text) => update('exactTime', text)}
          />
        ) : null}
        {values.timeMode === 'period' ? (
          <ChipRow
            accessibilityLabel="Time of day"
            options={DAY_PERIOD_OPTIONS}
            selected={values.dayPeriod}
            onSelect={(period) => update('dayPeriod', period)}
          />
        ) : null}
      </View>
      <LabeledInput
        label="Duration (min)"
        keyboardType="number-pad"
        value={values.durationMinutes}
        onChangeText={(text) => update('durationMinutes', text)}
      />
      <LabeledInput
        label="Address"
        value={values.address}
        onChangeText={(text) => update('address', text)}
      />
      <LabeledInput
        label="Travel time (min)"
        keyboardType="number-pad"
        value={values.travelMinutes}
        onChangeText={(text) => update('travelMinutes', text)}
      />
      <LabeledInput
        label="Things to take"
        multiline
        placeholder="One item per line"
        value={values.thingsToTake}
        onChangeText={(text) => update('thingsToTake', text)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.lg,
  },
  group: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
});
