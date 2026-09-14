import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';

import type { SystemVoiceEntryAdapter } from './system-voice-entry-adapter';
import type { NativeVoiceEntryBridge, VoiceEntryInbox, VoiceEntryInboxState } from './voice-entry-inbox';

export type SystemVoiceEntryServices = {
  adapter: SystemVoiceEntryAdapter;
  inbox: VoiceEntryInbox;
  bridge: NativeVoiceEntryBridge;
  openVoiceSettings: () => Promise<void>;
  openShortcutsApp: () => Promise<void>;
};

const SystemVoiceEntryContext = createContext<SystemVoiceEntryServices | null>(null);

type SystemVoiceEntryProviderProps = {
  services: SystemVoiceEntryServices;
  children: ReactNode;
};

export function SystemVoiceEntryProvider({ services, children }: SystemVoiceEntryProviderProps) {
  return (
    <SystemVoiceEntryContext.Provider value={services}>{children}</SystemVoiceEntryContext.Provider>
  );
}

export function useOptionalSystemVoiceEntry(): SystemVoiceEntryServices | null {
  return useContext(SystemVoiceEntryContext);
}

export function useVoiceEntryInboxState(inbox: VoiceEntryInbox): VoiceEntryInboxState {
  return useSyncExternalStore(
    useCallback((listener) => inbox.subscribe(listener), [inbox]),
    () => inbox.getState(),
  );
}
