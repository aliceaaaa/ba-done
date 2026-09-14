import type { NativeVoiceEntryBridge, NativeVoiceEntryItem } from '../model/voice-entry-inbox';

export type FakeNativeVoiceEntryBridge = NativeVoiceEntryBridge & {
  queue(item: NativeVoiceEntryItem): void;
  deliver(item: NativeVoiceEntryItem): void;
  listenerCount(): number;
};

export function createFakeNativeVoiceEntryBridge(available = true): FakeNativeVoiceEntryBridge {
  let items: NativeVoiceEntryItem[] = [];
  const listeners = new Set<() => void>();
  return {
    isAvailable: () => available,
    pendingCount: () => items.length,
    consume() {
      const drained = items;
      items = [];
      return drained;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    queue(item) {
      items.push(item);
    },
    deliver(item) {
      items.push(item);
      for (const listener of [...listeners]) {
        listener();
      }
    },
    listenerCount: () => listeners.size,
  };
}
