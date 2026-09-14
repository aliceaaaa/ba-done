import { requireOptionalNativeModule } from 'expo';

import type { VoiceEntrySource } from '../model/voice-entry-intent';
import {
  NULL_NATIVE_VOICE_ENTRY_BRIDGE,
  type NativeVoiceEntryBridge,
  type NativeVoiceEntryItem,
} from '../model/voice-entry-inbox';

export const NATIVE_VOICE_ENTRY_MODULE_NAME = 'SystemVoiceEntry';
export const NATIVE_VOICE_ENTRY_EVENT = 'onPayloadQueued';

export type NativeVoiceEntryModule = {
  pendingPayloadCount(): number;
  consumePendingPayloads(): unknown[];
  addListener(eventName: string, listener: () => void): { remove(): void };
};

const NATIVE_SOURCES: readonly VoiceEntrySource[] = ['iosAppIntent', 'androidAppAction'];

function loadNativeModule(): NativeVoiceEntryModule | null {
  try {
    return requireOptionalNativeModule<NativeVoiceEntryModule>(NATIVE_VOICE_ENTRY_MODULE_NAME);
  } catch {
    return null;
  }
}

export function toNativeVoiceEntryItem(value: unknown): NativeVoiceEntryItem | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const { source, ...payload } = value as Record<string, unknown>;
  const trustedSource = NATIVE_SOURCES.find((candidate) => candidate === source);
  return { source: trustedSource ?? 'deepLink', payload };
}

export function createNativeVoiceEntryBridge(
  load: () => NativeVoiceEntryModule | null = loadNativeModule,
): NativeVoiceEntryBridge {
  const module = load();
  if (module === null) {
    return NULL_NATIVE_VOICE_ENTRY_BRIDGE;
  }
  return {
    isAvailable: () => true,
    pendingCount: () => module.pendingPayloadCount(),
    consume: () =>
      module
        .consumePendingPayloads()
        .map(toNativeVoiceEntryItem)
        .filter((item): item is NativeVoiceEntryItem => item !== null),
    subscribe(listener) {
      const subscription = module.addListener(NATIVE_VOICE_ENTRY_EVENT, listener);
      return () => subscription.remove();
    },
  };
}
