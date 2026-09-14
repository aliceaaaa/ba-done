import type { AppStateSource, AppStateStatus } from '../model/voice-input-controller';

export type FakeAppState = AppStateSource & {
  set(state: AppStateStatus): void;
};

export function createFakeAppState(initial: AppStateStatus = 'active'): FakeAppState {
  let current = initial;
  const listeners = new Set<(state: AppStateStatus) => void>();
  return {
    currentState() {
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      current = next;
      for (const listener of [...listeners]) {
        listener(next);
      }
    },
  };
}

export type ManualScheduler = {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  pending(): number[];
  runNext(): Promise<void>;
};

export function createManualScheduler(): ManualScheduler {
  let counter = 0;
  const tasks = new Map<number, { callback: () => void; ms: number }>();
  return {
    setTimeout(callback, ms) {
      counter += 1;
      tasks.set(counter, { callback, ms });
      return counter;
    },
    clearTimeout(handle) {
      tasks.delete(handle as number);
    },
    pending() {
      return [...tasks.values()].map((task) => task.ms);
    },
    async runNext() {
      const [entry] = tasks.entries();
      if (entry === undefined) {
        return;
      }
      tasks.delete(entry[0]);
      entry[1].callback();
      for (let tick = 0; tick < 20; tick++) {
        await Promise.resolve();
      }
    },
  };
}
