import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { NotificationAdapter, NotificationResponseInput } from '../model/notification-adapter';
import type { NotificationResponseHandler } from '../model/notification-response-handler';
import type { ReminderCoordinator } from '../model/reminder-coordinator';

type ReminderLifecycleProps = {
  adapter: NotificationAdapter;
  coordinator: ReminderCoordinator;
  handler: NotificationResponseHandler;
};

export function ReminderLifecycle({ adapter, coordinator, handler }: ReminderLifecycleProps) {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function respond(response: NotificationResponseInput) {
      const outcome = await handler.handle(response);
      await adapter.clearLastResponse();
      if (active && outcome.kind === 'navigate') {
        router.push(outcome.path);
      }
    }

    async function start() {
      await adapter.initialize();
      await coordinator.refresh();
      const last = await adapter.getLastResponse();
      if (last !== null) {
        await respond(last);
      }
    }

    void start();
    const removeResponseListener = adapter.addResponseListener((response) => {
      void respond(response);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void coordinator.refresh();
      }
    });

    return () => {
      active = false;
      removeResponseListener();
      appState.remove();
    };
  }, [adapter, coordinator, handler, router]);

  return null;
}
