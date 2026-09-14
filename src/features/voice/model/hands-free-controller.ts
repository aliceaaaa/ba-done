import type {
  AppStateSource,
  VoiceInputController,
  VoiceSessionEnd,
  VoiceSessionResult,
} from './voice-input-controller';

export type HandsFreeStatus =
  | 'off'
  | 'awaitingConfirmation'
  | 'starting'
  | 'waitingForWakePhrase'
  | 'handlingCommand'
  | 'retrying'
  | 'paused';

export type HandsFreePauseReason =
  | 'user'
  | 'background'
  | 'interrupted'
  | 'permissionDenied'
  | 'unavailable'
  | 'tooManyErrors'
  | 'idleLimit'
  | 'manualInput';

export type HandsFreeState = {
  status: HandsFreeStatus;
  pauseReason: HandsFreePauseReason | null;
  consecutiveErrors: number;
  retryInMs: number | null;
};

export type Scheduler = {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type HandsFreeConfig = {
  maxConsecutiveErrors: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  maxIdleRestarts: number;
  restartDelayMs: number;
};

export type HandsFreeControllerDeps = {
  controller: VoiceInputController;
  appState: AppStateSource;
  scheduler: Scheduler;
  config: HandsFreeConfig;
  hasWakePhrase: (transcript: string) => boolean;
  onCommand: (result: VoiceSessionResult) => void;
};

export type HandsFreeController = {
  getState(): HandsFreeState;
  subscribe(listener: (state: HandsFreeState) => void): () => void;
  enable(): void;
  disable(): Promise<void>;
  start(): Promise<void>;
  pause(reason?: HandsFreePauseReason): Promise<void>;
  commandHandled(): void;
  dispose(): void;
};

export function backoffDelay(attempt: number, config: HandsFreeConfig): number {
  return Math.min(config.initialBackoffMs * 2 ** Math.max(0, attempt - 1), config.maxBackoffMs);
}

export function createHandsFreeController({
  controller,
  appState,
  scheduler,
  config,
  hasWakePhrase,
  onCommand,
}: HandsFreeControllerDeps): HandsFreeController {
  let state: HandsFreeState = {
    status: 'off',
    pauseReason: null,
    consecutiveErrors: 0,
    retryInMs: null,
  };
  let idleRestarts = 0;
  let timer: unknown = null;
  const listeners = new Set<(state: HandsFreeState) => void>();

  function setState(patch: Partial<HandsFreeState>) {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) {
      listener(state);
    }
  }

  function clearTimer() {
    if (timer !== null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
  }

  function isRunning(): boolean {
    return (
      state.status === 'starting' ||
      state.status === 'waitingForWakePhrase' ||
      state.status === 'retrying'
    );
  }

  function ownsSession(): boolean {
    const current = controller.getState();
    return current.mode === 'handsFree' && ['requestingPermission', 'listening', 'processing'].includes(current.status);
  }

  async function pause(reason: HandsFreePauseReason) {
    clearTimer();
    if (state.status === 'off') {
      return;
    }
    setState({ status: 'paused', pauseReason: reason, retryInMs: null });
    if (ownsSession()) {
      await controller.cancel();
    }
  }

  async function listen() {
    clearTimer();
    if (appState.currentState() !== 'active') {
      await pause('background');
      return;
    }
    setState({ status: 'starting', pauseReason: null, retryInMs: null });
    const outcome = await controller.start('handsFree');
    if (state.status !== 'starting') {
      return;
    }
    switch (outcome) {
      case 'started':
        setState({ status: 'waitingForWakePhrase' });
        return;
      case 'permissionDenied':
        await pause('permissionDenied');
        return;
      case 'unavailable':
        await pause('unavailable');
        return;
      case 'notForeground':
        await pause('background');
        return;
      case 'alreadyActive':
        await pause('manualInput');
        return;
      case 'error':
        scheduleRetry();
        return;
    }
  }

  function scheduleRestart() {
    idleRestarts += 1;
    if (idleRestarts > config.maxIdleRestarts) {
      void pause('idleLimit');
      return;
    }
    setState({ status: 'retrying', retryInMs: config.restartDelayMs });
    timer = scheduler.setTimeout(() => {
      timer = null;
      void listen();
    }, config.restartDelayMs);
  }

  function scheduleRetry() {
    const attempt = state.consecutiveErrors + 1;
    if (attempt > config.maxConsecutiveErrors) {
      setState({ consecutiveErrors: attempt });
      void pause('tooManyErrors');
      return;
    }
    const delay = backoffDelay(attempt, config);
    setState({ status: 'retrying', consecutiveErrors: attempt, retryInMs: delay });
    timer = scheduler.setTimeout(() => {
      timer = null;
      void listen();
    }, delay);
  }

  function handleResult(result: VoiceSessionResult) {
    if (result.mode !== 'handsFree' || !isRunning()) {
      return;
    }
    if (!hasWakePhrase(result.transcript)) {
      scheduleRestart();
      return;
    }
    idleRestarts = 0;
    setState({ status: 'handlingCommand', consecutiveErrors: 0, retryInMs: null });
    onCommand(result);
  }

  function handleEnd(end: VoiceSessionEnd) {
    if (end.mode === 'manual') {
      return;
    }
    if (end.reason === 'replaced') {
      if (state.status !== 'off') {
        clearTimer();
        setState({ status: 'paused', pauseReason: 'manualInput', retryInMs: null });
      }
      return;
    }
    if (!isRunning() || end.reason === 'result' || end.reason === 'cancelled') {
      return;
    }
    switch (end.reason) {
      case 'background':
        void pause('background');
        return;
      case 'permissionDenied':
        void pause('permissionDenied');
        return;
      case 'unavailable':
        void pause('unavailable');
        return;
      case 'noResult':
        scheduleRestart();
        return;
      case 'error':
        if (end.errorCode === 'interrupted' || end.errorCode === 'audioCapture') {
          void pause('interrupted');
        } else {
          scheduleRetry();
        }
        return;
    }
  }

  const subscriptions = [
    controller.onResult(handleResult),
    controller.onSessionEnd(handleEnd),
    appState.subscribe((next) => {
      if (next !== 'active' && state.status !== 'off' && state.status !== 'awaitingConfirmation') {
        if (state.status !== 'paused' || state.pauseReason === 'manualInput') {
          void pause('background');
        }
      }
    }),
  ];

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    enable() {
      if (state.status === 'off') {
        setState({ status: 'awaitingConfirmation', pauseReason: null, consecutiveErrors: 0 });
      }
    },

    async disable() {
      clearTimer();
      const owned = ownsSession();
      setState({ status: 'off', pauseReason: null, consecutiveErrors: 0, retryInMs: null });
      idleRestarts = 0;
      if (owned) {
        await controller.cancel();
      }
    },

    async start() {
      if (state.status === 'off') {
        return;
      }
      idleRestarts = 0;
      setState({ consecutiveErrors: 0 });
      await listen();
    },

    pause(reason = 'user') {
      return pause(reason);
    },

    commandHandled() {
      if (state.status === 'handlingCommand' || (state.status === 'paused' && state.pauseReason === 'manualInput')) {
        if (appState.currentState() === 'active') {
          void listen();
        } else {
          void pause('background');
        }
      }
    },

    dispose() {
      clearTimer();
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
      listeners.clear();
    },
  };
}
