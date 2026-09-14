import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { HandsFreeState } from './hands-free-controller';
import type { VoiceCommandHint } from './voice-command';
import type { VoiceCommandSessionState } from './voice-command-session';
import type { VoiceInputState } from './voice-input-controller';
import type { VoiceServices } from './voice-services';
import type { VoiceSettings } from './voice-settings';

const VoiceContext = createContext<VoiceServices | null>(null);

type VoiceProviderProps = {
  services: VoiceServices;
  children: ReactNode;
};

export function VoiceProvider({ services, children }: VoiceProviderProps) {
  useEffect(() => {
    void services.settings.load();
  }, [services]);

  return <VoiceContext.Provider value={services}>{children}</VoiceContext.Provider>;
}

export function useOptionalVoice(): VoiceServices | null {
  return useContext(VoiceContext);
}

export function useVoice(): VoiceServices {
  const services = useContext(VoiceContext);
  if (services === null) {
    throw new Error('VoiceProvider is missing');
  }
  return services;
}

export function useVoiceInputState(services: VoiceServices): VoiceInputState {
  return useSyncExternalStore(
    useCallback((listener) => services.controller.subscribe(listener), [services]),
    () => services.controller.getState(),
  );
}

export function useHandsFreeState(services: VoiceServices): HandsFreeState {
  return useSyncExternalStore(
    useCallback((listener) => services.handsFree.subscribe(listener), [services]),
    () => services.handsFree.getState(),
  );
}

export function useVoiceSessionState(services: VoiceServices): VoiceCommandSessionState {
  return useSyncExternalStore(
    useCallback((listener) => services.session.subscribe(listener), [services]),
    () => services.session.getState(),
  );
}

export function useVoiceSettings(services: VoiceServices): VoiceSettings {
  return useSyncExternalStore(
    useCallback((listener) => services.settings.subscribe(listener), [services]),
    () => services.settings.get(),
  );
}

export function useVoiceHint(hint: VoiceCommandHint) {
  const services = useOptionalVoice();
  const key = JSON.stringify(hint);
  useFocusEffect(
    useCallback(() => {
      services?.setFocusedHint(JSON.parse(key) as VoiceCommandHint);
      return () => services?.setFocusedHint({ kind: 'none' });
    }, [services, key]),
  );
}
