import { StyleSheet, Text, View } from 'react-native';

import { DAY_PERIOD_LABELS, DAY_PERIODS, type DayPeriod } from '@/entities/task';
import { ChipRow, type ChipOption } from '@/shared/ui/chip-row';
import { LabeledInput } from '@/shared/ui/labeled-input';
import { colors, spacing } from '@/shared/ui/theme';

import {
  selectDayPeriod,
  selectTimeMode,
  type EditorValues,
  type ReminderMode,
  type TimeMode,
} from '../model/editor-values';

const TIME_MODE_OPTIONS: readonly ChipOption<TimeMode>[] = [
  { value: 'none', label: 'No time' },
  { value: 'exact', label: 'Exact time' },
  { value: 'period', label: 'Time of day' },
];

const REMINDER_MODE_OPTIONS: readonly ChipOption<ReminderMode>[] = [
  { value: 'none', label: 'No reminder' },
  { value: 'exact', label: 'At a date and time' },
  { value: 'period', label: 'At a time of day' },
];

const DAY_PERIOD_OPTIONS: readonly ChipOption<DayPeriod>[] = DAY_PERIODS.map((period) => ({
  value: period,
  label: DAY_PERIOD_LABELS[period],
}));

type FieldsProps = {
  values: EditorValues;
  onChange: (values: EditorValues) => void;
};

function PeriodChips({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: DayPeriod | null;
  onSelect: (period: DayPeriod) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.periods}>
      <ChipRow
        accessibilityLabel={label}
        options={DAY_PERIOD_OPTIONS}
        selected={selected ?? ('' as DayPeriod)}
        onSelect={onSelect}
      />
    </View>
  );
}

export function TimeFields({ values, onChange }: FieldsProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>Time</Text>
      <ChipRow
        accessibilityLabel="Time"
        options={TIME_MODE_OPTIONS}
        selected={values.timeMode}
        onSelect={(mode) => onChange(selectTimeMode(values, mode))}
      />
      {values.timeMode === 'exact' ? (
        <LabeledInput
          label="Exact time"
          placeholder="HH:mm"
          keyboardType="numbers-and-punctuation"
          value={values.exactTime}
          onChangeText={(exactTime) => onChange({ ...values, exactTime })}
        />
      ) : null}
      {values.timeMode === 'period' ? (
        <PeriodChips
          label="Time of day"
          selected={values.dayPeriod}
          onSelect={(period) => onChange(selectDayPeriod(values, period))}
        />
      ) : null}
    </View>
  );
}

export function ReminderFields({ values, onChange, timeZone }: FieldsProps & { timeZone: string }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>Reminder</Text>
      <ChipRow
        accessibilityLabel="Reminder"
        options={REMINDER_MODE_OPTIONS}
        selected={values.reminderMode}
        onSelect={(reminderMode) => onChange({ ...values, reminderMode })}
      />
      {values.reminderMode === 'exact' ? (
        <View style={styles.pair}>
          <LabeledInput
            label="Reminder date"
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            value={values.reminderDate}
            onChangeText={(reminderDate) => onChange({ ...values, reminderDate })}
          />
          <LabeledInput
            label="Reminder time"
            placeholder="HH:mm"
            keyboardType="numbers-and-punctuation"
            value={values.reminderTime}
            onChangeText={(reminderTime) => onChange({ ...values, reminderTime })}
          />
        </View>
      ) : null}
      {values.reminderMode === 'period' ? (
        <PeriodChips
          label="Reminder time of day"
          selected={values.reminderPeriod}
          onSelect={(reminderPeriod) => onChange({ ...values, reminderPeriod })}
        />
      ) : null}
      {values.reminderMode === 'none' ? null : (
        <Text style={styles.hint}>{`Time zone: ${timeZone}`}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  pair: {
    gap: spacing.sm,
  },
  periods: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
  },
});
