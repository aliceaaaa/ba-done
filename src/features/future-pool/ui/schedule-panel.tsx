import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  PriorityPicker,
  describeTaskError,
  useTaskService,
  type FutureTask,
  type PrioritySlot,
  type RankedTask,
} from '@/entities/task';
import { DateField } from '@/shared/ui/date-field';
import { TextButton } from '@/shared/ui/text-button';
import { colors, spacing } from '@/shared/ui/theme';

type SchedulePanelProps = {
  task: FutureTask;
  today: string;
  onScheduled: (task: RankedTask) => void;
  onCancel: () => void;
};

export function SchedulePanel({ task, today, onScheduled, onCancel }: SchedulePanelProps) {
  const service = useTaskService();
  const [date, setDate] = useState(today);
  const [priority, setPriority] = useState<number | null>(null);
  const [slots, setSlots] = useState<PrioritySlot[] | null>(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void service.getPriorityAvailability(date).then((next) => {
      if (active) {
        setSlots(next);
      }
    });
    return () => {
      active = false;
    };
  }, [service, date, slotsVersion]);

  async function schedule() {
    const result = await service.scheduleFutureTask(task.id, { scheduledDate: date, priority });
    if (result.ok) {
      onScheduled(result.value);
      return;
    }
    setError(describeTaskError(result.error));
    if (result.error.type === 'PriorityConflict') {
      setPriority(null);
      setSlotsVersion((version) => version + 1);
    }
  }

  return (
    <View style={styles.panel} testID={`schedule-panel-${task.id}`}>
      <DateField
        label="Date"
        date={date}
        today={today}
        onChange={(next) => {
          setDate(next);
          setPriority(null);
        }}
      />
      {slots === null ? null : (
        <PriorityPicker slots={slots} selected={priority} onSelect={setPriority} />
      )}
      {error === null ? null : (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <View style={styles.actions}>
        <TextButton label="Cancel" onPress={onCancel} />
        <TextButton label="Schedule" variant="primary" onPress={() => void schedule()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    paddingTop: spacing.md,
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
