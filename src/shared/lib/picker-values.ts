import { isValidLocalDate, isValidLocalTime } from './local-date';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function pickerDateToLocalDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function pickerDateToLocalTime(value: Date): string {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function localDateToPickerDate(localDate: string, fallback: Date = new Date()): Date {
  if (!isValidLocalDate(localDate)) {
    return fallback;
  }
  const [year = 0, month = 1, day = 1] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function localTimeToPickerDate(localTime: string, base: Date = new Date()): Date {
  const result = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0, 0);
  if (!isValidLocalTime(localTime)) {
    return result;
  }
  const [hours = 0, minutes = 0] = localTime.split(':').map(Number);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function formatLocalTime(localTime: string): string {
  return isValidLocalTime(localTime)
    ? timeFormatter.format(localTimeToPickerDate(localTime))
    : localTime;
}
