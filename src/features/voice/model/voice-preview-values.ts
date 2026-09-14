import { parseQuantityText } from '@/entities/list';
import type { DayPeriod } from '@/entities/task';
import { VOICE_CONFIG } from '@/shared/config/voice-config';
import { addMinutesToLocalDateTime } from '@/shared/lib/local-date';

import type { VoiceCommandDraft, VoiceReminderDraft } from './voice-command';
import type { VoiceSaveInput } from './voice-save-input';

export type PreviewKind = 'listItem' | 'futureTask' | 'rankedTask' | 'calendarEvent';

export type ListChoice = { type: 'existing'; listId: string } | { type: 'new'; title: string } | null;

export type VoicePreviewValues = {
  kind: PreviewKind | null;
  title: string;
  listChoice: ListChoice;
  quantityText: string;
  unit: string;
  date: string;
  priority: number | null;
  exactTime: string | null;
  dayPeriod: DayPeriod | null;
  reminder: VoiceReminderDraft | null;
  dateSet: boolean;
  startSet: boolean;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

export const PREVIEW_KIND_LABELS: Record<PreviewKind, string> = {
  listItem: 'List item',
  futureTask: 'Future task',
  rankedTask: 'Task for a day',
  calendarEvent: 'Event',
};

function split(localDateTime: string | null, fallbackDate: string, fallbackTime: string) {
  if (localDateTime === null) {
    return { date: fallbackDate, time: fallbackTime };
  }
  const [date = fallbackDate, time = fallbackTime] = localDateTime.split('T');
  return { date, time };
}

export function previewValuesFromDraft(draft: VoiceCommandDraft, today: string): VoicePreviewValues {
  const date = draft.date ?? today;
  const start = split(draft.eventStart, date, '09:00');
  const end = split(
    draft.eventEnd ??
      addMinutesToLocalDateTime(`${start.date}T${start.time}`, VOICE_CONFIG.suggestedEventMinutes),
    start.date,
    '10:00',
  );
  const listChoice: ListChoice =
    draft.targetListId === null ? null : { type: 'existing', listId: draft.targetListId };
  return {
    kind: draft.kind === 'unknown' ? null : draft.kind,
    title: draft.title ?? '',
    listChoice,
    quantityText: draft.quantity === null ? '' : String(draft.quantity),
    unit: draft.unit ?? '',
    date,
    priority: draft.priority,
    exactTime: draft.exactTime,
    dayPeriod: draft.dayPeriod,
    reminder: draft.reminder,
    dateSet: draft.date !== null,
    startSet: draft.eventStart !== null,
    allDay: false,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
  };
}

export type PreviewInputResult =
  | { ok: true; input: VoiceSaveInput }
  | { ok: false; field: 'kind' | 'targetList' | 'quantity' | 'date' | 'eventStart'; message: string };

export const PREVIEW_MESSAGES = {
  chooseType: 'Choose what to create',
  chooseList: 'Choose a list or create a new one',
  invalidQuantity: 'Enter the quantity as a number',
  chooseDate: 'Choose a date',
  chooseStart: 'Choose when the event starts',
} as const;

export function saveInputFromPreview(values: VoicePreviewValues): PreviewInputResult {
  switch (values.kind) {
    case null:
      return { ok: false, field: 'kind', message: PREVIEW_MESSAGES.chooseType };
    case 'listItem': {
      const quantity = parseQuantityText(values.quantityText);
      if (quantity === 'invalid') {
        return { ok: false, field: 'quantity', message: PREVIEW_MESSAGES.invalidQuantity };
      }
      const unit = values.unit.trim().length === 0 ? null : values.unit;
      if (values.listChoice === null) {
        return { ok: false, field: 'targetList', message: PREVIEW_MESSAGES.chooseList };
      }
      return values.listChoice.type === 'existing'
        ? {
            ok: true,
            input: {
              kind: 'listItem',
              listId: values.listChoice.listId,
              title: values.title,
              quantity,
              unit,
            },
          }
        : {
            ok: true,
            input: {
              kind: 'newListItem',
              listTitle: values.listChoice.title,
              title: values.title,
              quantity,
              unit,
            },
          };
    }
    case 'futureTask':
      return {
        ok: true,
        input: {
          kind: 'futureTask',
          title: values.title,
          exactTime: values.exactTime,
          dayPeriod: values.dayPeriod,
          reminder: values.reminder,
        },
      };
    case 'rankedTask':
      if (!values.dateSet) {
        return { ok: false, field: 'date', message: PREVIEW_MESSAGES.chooseDate };
      }
      return {
        ok: true,
        input: {
          kind: 'rankedTask',
          title: values.title,
          date: values.date,
          priority: values.priority,
          exactTime: values.exactTime,
          dayPeriod: values.dayPeriod,
          reminder: values.reminder,
        },
      };
    case 'calendarEvent':
      if (!values.startSet) {
        return { ok: false, field: 'eventStart', message: PREVIEW_MESSAGES.chooseStart };
      }
      return {
        ok: true,
        input: {
          kind: 'calendarEvent',
          title: values.title,
          allDay: values.allDay,
          start: `${values.startDate}T${values.startTime}`,
          end: `${values.endDate}T${values.endTime}`,
          reminder: values.reminder?.type === 'exact' ? values.reminder.localDateTime : null,
        },
      };
  }
}
