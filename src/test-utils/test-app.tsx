import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Alert, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import TodayRoute from '@/app/(tabs)/index';
import SettingsRoute from '@/app/(tabs)/settings';
import FutureRoute from '@/app/future';
import EditTaskRoute from '@/app/task/[id]/edit';
import TaskDetailsRoute from '@/app/task/[id]/index';
import ChangePriorityRoute from '@/app/task/[id]/priority';
import RemindLaterRoute from '@/app/task/[id]/remind-later';
import NewTaskRoute from '@/app/task/new';
import { migrateDatabase } from '@/database/migrations';
import type { SqlDatabase } from '@/database/sql-database';
import {
  createNodeSqliteDatabase,
  type NodeSqliteDatabase,
} from '@/database/testing/node-sqlite-database';
import {
  createTaskService,
  TaskServiceProvider,
  type TaskResult,
  type TaskService,
} from '@/entities/task';
import {
  ReminderLifecycle,
  ReminderNoticeHost,
  ReminderProvider,
  createNotificationResponseHandler,
  createReminderCoordinator,
  createSyncedTaskService,
  type NotificationPermission,
  type NotificationResponseHandler,
  type ReminderCoordinator,
} from '@/features/reminders';
import {
  createFakeNotificationAdapter,
  type FakeNotificationAdapter,
} from '@/features/reminders/testing/fake-notification-adapter';

export const TEST_TIME_ZONE = 'Europe/Berlin';
export const TEST_START = '2026-09-11T08:00:00.000Z';
export const TODAY = '2026-09-11';
export const TOMORROW = '2026-09-12';
export const YESTERDAY = '2026-09-10';

type TestServiceOptions = {
  start?: string;
  timeZone?: string;
  idPrefix?: string;
  now?: () => Date;
};

export async function createTestDatabase(): Promise<NodeSqliteDatabase> {
  const db = createNodeSqliteDatabase();
  await migrateDatabase(db);
  return db;
}

export function createTestClock(start: string = TEST_START): () => Date {
  let current = Date.parse(start);
  return () => {
    current += 1000;
    return new Date(current);
  };
}

export function createTestService(db: SqlDatabase, options: TestServiceOptions = {}): TaskService {
  let counter = 0;
  const prefix = options.idPrefix ?? 'id';
  const zone = options.timeZone ?? TEST_TIME_ZONE;
  return createTaskService({
    db,
    now: options.now ?? createTestClock(options.start),
    generateId: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
    timeZone: () => zone,
  });
}

export type TestReminders = {
  raw: TaskService;
  service: TaskService;
  adapter: FakeNotificationAdapter;
  coordinator: ReminderCoordinator;
  handler: NotificationResponseHandler;
  setTimeZone(timeZone: string): void;
};

type TestRemindersOptions = {
  start?: string;
  timeZone?: string;
  permission?: NotificationPermission;
  requestResult?: NotificationPermission;
};

export function createTestReminders(
  db: SqlDatabase,
  options: TestRemindersOptions = {},
): TestReminders {
  const now = createTestClock(options.start);
  let zone = options.timeZone ?? TEST_TIME_ZONE;
  const raw = createTaskService({
    db,
    now,
    generateId: (() => {
      let counter = 0;
      return () => {
        counter += 1;
        return `id-${counter}`;
      };
    })(),
    timeZone: () => zone,
  });
  const adapter = createFakeNotificationAdapter({
    ...(options.permission === undefined ? {} : { permission: options.permission }),
    ...(options.requestResult === undefined ? {} : { requestResult: options.requestResult }),
  });
  const coordinator = createReminderCoordinator({
    db,
    service: raw,
    adapter,
    now,
    timeZone: () => zone,
  });
  const service = createSyncedTaskService(raw, coordinator);
  const handler = createNotificationResponseHandler({ db, service, now });
  return {
    raw,
    service,
    adapter,
    coordinator,
    handler,
    setTimeZone(next) {
      zone = next;
    },
  };
}

export function unwrap<T>(result: TaskResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error.type}: ${result.error.message}`);
  }
  return result.value;
}

export function renderApp(service: TaskService, initialUrl = '/', reminders?: TestReminders) {
  function TestLayout() {
    const stack = <Stack screenOptions={{ headerShown: false }} />;
    return (
      <GestureHandlerRootView style={styles.root}>
        <TaskServiceProvider service={service}>
          {reminders === undefined ? (
            stack
          ) : (
            <ReminderProvider coordinator={reminders.coordinator}>
              {stack}
              <ReminderLifecycle
                adapter={reminders.adapter}
                coordinator={reminders.coordinator}
                handler={reminders.handler}
              />
              <ReminderNoticeHost coordinator={reminders.coordinator} />
            </ReminderProvider>
          )}
        </TaskServiceProvider>
      </GestureHandlerRootView>
    );
  }

  return renderRouter(
    {
      _layout: TestLayout,
      index: TodayRoute,
      settings: SettingsRoute,
      future: FutureRoute,
      'task/new': NewTaskRoute,
      'task/[id]/index': TaskDetailsRoute,
      'task/[id]/edit': EditTaskRoute,
      'task/[id]/remind-later': RemindLaterRoute,
      'task/[id]/priority': ChangePriorityRoute,
    },
    { initialUrl },
  );
}

export async function pickDateTime(label: string, value: Date): Promise<void> {
  await fireEvent(
    screen.getByLabelText(label),
    'onChange',
    { type: 'set', nativeEvent: { timestamp: value.getTime(), utcOffset: 0 } },
    value,
  );
}

export function mockAlert() {
  return jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
}

export type AlertMock = ReturnType<typeof mockAlert>;

export async function pressAlertButton(alert: AlertMock, label: string): Promise<void> {
  const buttons = alert.mock.lastCall?.[2] ?? [];
  const button = buttons.find((item) => item.text === label);
  if (button === undefined) {
    throw new Error(`Alert button "${label}" not found`);
  }
  await act(async () => {
    button.onPress?.();
  });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
