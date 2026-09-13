import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatLocalTime,
  localDateToPickerDate,
  localTimeToPickerDate,
  pickerDateToLocalDate,
  pickerDateToLocalTime,
} from '@/shared/lib/picker-values';

import { colors, spacing } from './theme';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

type DateTimeFieldProps = {
  mode: 'date' | 'time';
  label: string;
  value: string;
  onChange: (value: string) => void;
  showLabel?: boolean;
};

export function DateTimeField({
  mode,
  label,
  value,
  onChange,
  showLabel = true,
}: DateTimeFieldProps) {
  const pickerValue = mode === 'date' ? localDateToPickerDate(value) : localTimeToPickerDate(value);
  const displayValue = mode === 'date' ? dateFormatter.format(pickerValue) : formatLocalTime(value);

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type !== 'set' || selected === undefined) {
      return;
    }
    onChange(mode === 'date' ? pickerDateToLocalDate(selected) : pickerDateToLocalTime(selected));
  }

  return (
    <View style={styles.field}>
      {showLabel ? <Text style={styles.label}>{label}</Text> : null}
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: displayValue }}
          onPress={() =>
            DateTimePickerAndroid.open({ value: pickerValue, mode, onChange: handleChange })
          }
          style={styles.androidValue}
        >
          <Text style={styles.value}>{displayValue}</Text>
        </Pressable>
      ) : (
        <DateTimePicker
          accessibilityLabel={label}
          value={pickerValue}
          mode={mode}
          display="compact"
          onChange={handleChange}
          style={styles.iosPicker}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  androidValue: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  value: {
    fontSize: 16,
    color: colors.text,
  },
  iosPicker: {
    alignSelf: 'flex-start',
  },
});
