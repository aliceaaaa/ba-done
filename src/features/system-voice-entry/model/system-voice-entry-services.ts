import type { SqlDatabase } from '@/database/sql-database';
import type { ListService } from '@/entities/list';
import type { VoiceServices } from '@/features/voice';

import { createVoiceEntryIntentRepository } from '../api/voice-entry-intent-repository';
import { createSystemVoiceEntryAdapter } from './system-voice-entry-adapter';
import type { SystemVoiceEntryServices } from './system-voice-entry-context';
import { createVoiceEntryInbox, type NativeVoiceEntryBridge } from './voice-entry-inbox';

export type SystemVoiceEntryServicesDeps = {
  db: SqlDatabase;
  voice: VoiceServices;
  lists: Pick<ListService, 'getLists'>;
  bridge: NativeVoiceEntryBridge;
  now: () => Date;
  timeZone: () => string;
  generateId: () => string;
  openVoiceSettings: () => Promise<void>;
  openShortcutsApp: () => Promise<void>;
};

export function createSystemVoiceEntryServices(
  deps: SystemVoiceEntryServicesDeps,
): SystemVoiceEntryServices {
  const adapter = createSystemVoiceEntryAdapter({
    repository: createVoiceEntryIntentRepository(deps.db),
    executor: deps.voice.executor,
    session: deps.voice.session,
    lists: deps.lists,
    now: deps.now,
    timeZone: deps.timeZone,
    generateId: deps.generateId,
    preferredLanguage: () => (deps.voice.getLocale().toLowerCase().startsWith('ru') ? 'ru' : 'en'),
  });
  return {
    adapter,
    inbox: createVoiceEntryInbox(adapter, deps.bridge),
    bridge: deps.bridge,
    openVoiceSettings: deps.openVoiceSettings,
    openShortcutsApp: deps.openShortcutsApp,
  };
}
