import { DAY_PERIODS, type DayPeriod, type TaskReminder } from '../model/types';

function isDayPeriodValue(value: unknown): value is DayPeriod {
  return typeof value === 'string' && (DAY_PERIODS as readonly string[]).includes(value);
}

export function parseReminder(value: unknown): TaskReminder | null {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return null;
  }
  if (!('timeZone' in value) || typeof value.timeZone !== 'string') {
    return null;
  }
  if (
    value.type === 'exact' &&
    'localDateTime' in value &&
    typeof value.localDateTime === 'string'
  ) {
    return { type: 'exact', localDateTime: value.localDateTime, timeZone: value.timeZone };
  }
  if (value.type === 'dayPeriod' && 'period' in value && isDayPeriodValue(value.period)) {
    return { type: 'dayPeriod', period: value.period, timeZone: value.timeZone };
  }
  return null;
}
