import type { DayPeriod } from '@/entities/task';

import type { VoiceCommandDraft, VoiceReminderDraft } from './voice-command';

export type VoiceSaveInput =
  | {
      kind: 'listItem';
      listId: string;
      title: string;
      quantity: number | null;
      unit: string | null;
    }
  | {
      kind: 'newListItem';
      listTitle: string;
      title: string;
      quantity: number | null;
      unit: string | null;
    }
  | {
      kind: 'futureTask';
      title: string;
      exactTime: string | null;
      dayPeriod: DayPeriod | null;
      reminder: VoiceReminderDraft | null;
    }
  | {
      kind: 'rankedTask';
      title: string;
      date: string | null;
      priority: number | null;
      exactTime: string | null;
      dayPeriod: DayPeriod | null;
      reminder: VoiceReminderDraft | null;
    }
  | {
      kind: 'calendarEvent';
      title: string;
      allDay: boolean;
      start: string | null;
      end: string | null;
      reminder: string | null;
    };

export function saveInputFromDraft(draft: VoiceCommandDraft): VoiceSaveInput | null {
  const title = draft.title ?? '';
  switch (draft.kind) {
    case 'listItem':
      return draft.targetListId === null
        ? null
        : {
            kind: 'listItem',
            listId: draft.targetListId,
            title,
            quantity: draft.quantity,
            unit: draft.unit,
          };
    case 'futureTask':
      return {
        kind: 'futureTask',
        title,
        exactTime: draft.exactTime,
        dayPeriod: draft.dayPeriod,
        reminder: draft.reminder,
      };
    case 'rankedTask':
      return {
        kind: 'rankedTask',
        title,
        date: draft.date,
        priority: draft.priority,
        exactTime: draft.exactTime,
        dayPeriod: draft.dayPeriod,
        reminder: draft.reminder,
      };
    case 'calendarEvent':
      return {
        kind: 'calendarEvent',
        title,
        allDay: false,
        start: draft.eventStart,
        end: draft.eventEnd,
        reminder: draft.reminder?.type === 'exact' ? draft.reminder.localDateTime : null,
      };
    case 'unknown':
      return null;
  }
}
