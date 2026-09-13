import type {
  ExactAlarmSupport,
  NotificationAdapter,
  NotificationPermission,
  NotificationResponseInput,
  ScheduleNotificationRequest,
  ScheduledNotification,
} from '../model/notification-adapter';

export type FakeNotificationAdapter = NotificationAdapter & {
  scheduled: Map<string, ScheduleNotificationRequest>;
  foreign: ScheduledNotification[];
  calls: {
    initialize: number;
    request: number;
    schedule: string[];
    cancel: string[];
    openSettings: number;
  };
  setPermission(permission: NotificationPermission): void;
  setRequestResult(permission: NotificationPermission): void;
  failNextSchedule(message: string): void;
  loseAllScheduled(): void;
  emitResponse(response: NotificationResponseInput): void;
  setLastResponse(response: NotificationResponseInput | null): void;
};

export type FakeNotificationAdapterOptions = {
  permission?: NotificationPermission;
  requestResult?: NotificationPermission;
  exactAlarmSupport?: ExactAlarmSupport;
};

export const GRANTED: NotificationPermission = { status: 'granted', canAskAgain: true };
export const DENIED: NotificationPermission = { status: 'denied', canAskAgain: false };
export const UNDETERMINED: NotificationPermission = { status: 'undetermined', canAskAgain: true };

export function createFakeNotificationAdapter(
  options: FakeNotificationAdapterOptions = {},
): FakeNotificationAdapter {
  let permission = options.permission ?? UNDETERMINED;
  let requestResult = options.requestResult ?? GRANTED;
  let scheduleFailure: string | null = null;
  let lastResponse: NotificationResponseInput | null = null;
  const listeners = new Set<(response: NotificationResponseInput) => void>();
  const scheduled = new Map<string, ScheduleNotificationRequest>();
  const foreign: ScheduledNotification[] = [];
  const calls = { initialize: 0, request: 0, schedule: [], cancel: [], openSettings: 0 } as {
    initialize: number;
    request: number;
    schedule: string[];
    cancel: string[];
    openSettings: number;
  };

  return {
    scheduled,
    foreign,
    calls,

    async initialize() {
      calls.initialize += 1;
    },

    async getPermission() {
      return permission;
    },

    async requestPermission() {
      calls.request += 1;
      permission = requestResult;
      return permission;
    },

    async schedule(request) {
      calls.schedule.push(request.identifier);
      if (scheduleFailure !== null) {
        const message = scheduleFailure;
        scheduleFailure = null;
        throw new Error(message);
      }
      scheduled.set(request.identifier, request);
      return request.identifier;
    },

    async cancel(identifier) {
      calls.cancel.push(identifier);
      scheduled.delete(identifier);
      const index = foreign.findIndex((item) => item.identifier === identifier);
      if (index >= 0) {
        foreign.splice(index, 1);
      }
    },

    async listScheduled() {
      return [
        ...[...scheduled.values()].map((request) => ({
          identifier: request.identifier,
          data: { ...request.data },
        })),
        ...foreign,
      ];
    },

    async openSettings() {
      calls.openSettings += 1;
    },

    getExactAlarmSupport() {
      return options.exactAlarmSupport ?? 'exact';
    },

    addResponseListener(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async getLastResponse() {
      return lastResponse;
    },

    async clearLastResponse() {
      lastResponse = null;
    },

    setPermission(next) {
      permission = next;
    },

    setRequestResult(next) {
      requestResult = next;
    },

    failNextSchedule(message) {
      scheduleFailure = message;
    },

    loseAllScheduled() {
      scheduled.clear();
    },

    emitResponse(response) {
      for (const listener of [...listeners]) {
        listener(response);
      }
    },

    setLastResponse(response) {
      lastResponse = response;
    },
  };
}
