import {
  addDays,
  addMinutes,
  roundUpToMinute,
  toLocalDate,
  toLocalDateTime,
  zonedDateTimeToInstant,
} from '@/shared/lib/local-date';

import type { DayPeriodTimes } from '../model/types';

export type SnoozeOptionKey = 'in15Minutes' | 'in1Hour' | 'tonight' | 'tomorrow';

export type SnoozeOption = {
  key: SnoozeOptionKey;
  label: string;
  localDateTime: string | null;
};

export function buildSnoozeOptions(
  now: Date,
  timeZone: string,
  times: DayPeriodTimes,
): SnoozeOption[] {
  const today = toLocalDate(now, timeZone);
  const tonight = `${today}T${times.night}`;
  const tonightIsAhead = zonedDateTimeToInstant(tonight, timeZone).getTime() > now.getTime();
  return [
    {
      key: 'in15Minutes',
      label: '15 minutes',
      localDateTime: toLocalDateTime(roundUpToMinute(addMinutes(now, 15)), timeZone),
    },
    {
      key: 'in1Hour',
      label: '1 hour',
      localDateTime: toLocalDateTime(roundUpToMinute(addMinutes(now, 60)), timeZone),
    },
    { key: 'tonight', label: 'Tonight', localDateTime: tonightIsAhead ? tonight : null },
    {
      key: 'tomorrow',
      label: 'Tomorrow',
      localDateTime: `${addDays(today, 1)}T${times.morning}`,
    },
  ];
}
