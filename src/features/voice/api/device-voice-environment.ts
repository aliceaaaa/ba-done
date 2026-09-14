import { getLocales } from 'expo-localization';
import { AppState, Linking } from 'react-native';

import type { AppStateSource, AppStateStatus } from '../model/voice-input-controller';

export function getDeviceLocale(): string {
  return getLocales()[0]?.languageTag ?? 'en-US';
}

export function createReactNativeAppState(): AppStateSource {
  return {
    currentState() {
      return AppState.currentState as AppStateStatus;
    },
    subscribe(listener) {
      const subscription = AppState.addEventListener('change', (state) =>
        listener(state as AppStateStatus),
      );
      return () => subscription.remove();
    },
  };
}

export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}

export const systemScheduler = {
  setTimeout(callback: () => void, ms: number): unknown {
    return setTimeout(callback, ms);
  },
  clearTimeout(handle: unknown) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};
