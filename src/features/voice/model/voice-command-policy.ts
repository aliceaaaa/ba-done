import type { VoiceCommandDraft } from './voice-command';

export function canExecuteImmediately(draft: VoiceCommandDraft): boolean {
  if (draft.missingFields.length > 0 || draft.ambiguities.length > 0 || draft.title === null) {
    return false;
  }
  if (draft.kind === 'listItem') {
    return draft.targetListId !== null;
  }
  if (draft.kind === 'futureTask') {
    return draft.date === null && draft.priority === null && draft.reminder === null;
  }
  return false;
}
