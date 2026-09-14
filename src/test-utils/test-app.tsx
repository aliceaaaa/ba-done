import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import CalendarRoute from '@/app/(tabs)/calendar';
import TodayRoute from '@/app/(tabs)/index';
import SettingsRoute from '@/app/(tabs)/settings';
import EditEventRoute from '@/app/event/[id]/edit';
import EventDetailsRoute from '@/app/event/[id]/index';
import EventRemindLaterRoute from '@/app/event/[id]/remind-later';
import NewEventRoute from '@/app/event/new';
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
  CalendarEventServiceProvider,
  createCalendarEventService,
  type CalendarEventService,
  type EventResult,
} from '@/entities/calendar-event';
import { createListService, type ListResult, type ListService } from '@/entities/list';
import { createAppSettingsRepository } from '@/entities/reminder';
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
  createSyncedCalendarEventService,
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

function createIdGenerator(prefix: string): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

export function createTestService(db: SqlDatabase, options: TestServiceOptions = {}): TaskService {
  const zone = options.timeZone ?? TEST_TIME_ZONE;
  const settings = createAppSettingsRepository(db);
  return createTaskService({
    db,
    now: options.now ?? createTestClock(options.start),
    generateId: createIdGenerator(options.idPrefix ?? 'id'),
    timeZone: () => zone,
    dayPeriodTimes: () => settings.getDayPeriodTimes(),
  });
}

export function createTestEventService(
  db: SqlDatabase,
  options: TestServiceOptions = {},
): CalendarEventService {
  const zone = options.timeZone ?? TEST_TIME_ZONE;
  return createCalendarEventService({
    db,
    now: options.now ?? createTestClock(options.start),
    generateId: createIdGenerator(options.idPrefix ?? 'event'),
    timeZone: () => zone,
  });
}

export function createTestListService(
  db: SqlDatabase,
  options: TestServiceOptions = {},
): ListService {
  return createListService({
    db,
    now: options.now ?? createTestClock(options.start),
    generateId: createIdGenerator(options.idPrefix ?? 'list'),
  });
}

export type TestReminders = {
  raw: TaskService;
  service: TaskService;
  rawEvents: CalendarEventService;
  events: CalendarEventService;
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
  const settings = createAppSettingsRepository(db);
  const raw = createTaskService({
    db,
    now,
    generateId: createIdGenerator('id'),
    timeZone: () => zone,
    dayPeriodTimes: () => settings.getDayPeriodTimes(),
  });
  const rawEvents = createCalendarEventService({
    db,
    now,
    generateId: createIdGenerator('event'),
    timeZone: () => zone,
  });
  const adapter = createFakeNotificationAdapter({
    ...(options.permission === undefined ? {} : { permission: options.permission }),
    ...(options.requestResult === undefined ? {} : { requestResult: options.requestResult }),
  });
  const coordinator = createReminderCoordinator({
    db,
    service: raw,
    events: rawEvents,
    adapter,
    now,
    timeZone: () => zone,
  });
  const service = createSyncedTaskService(raw, coordinator);
  const events = createSyncedCalendarEventService(rawEvents, coordinator);
  const handler = createNotificationResponseHandler({ db, service, events, now });
  return {
    raw,
    service,
    rawEvents,
    events,
    adapter,
    coordinator,
    handler,
    setTimeZone(next) {
      zone = next;
    },
  };
}

export function unwrap<T>(result: TaskResult<T> | EventResult<T> | ListResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error.type}: ${result.error.message}`);
  }
  return result.value;
}

export function renderApp(
  service: TaskService,
  initialUrl = '/',
  reminders?: TestReminders,
  eventService?: CalendarEventService,
) {
  const events = reminders?.events ?? eventService;

  function withEvents(children: ReactNode) {
    return events === undefined ? (
      children
    ) : (
      <CalendarEventServiceProvider service={events}>{children}</CalendarEventServiceProvider>
    );
  }

  function TestLayout() {
    const stack = <Stack screenOptions={{ headerShown: false }} />;
    return (
      <GestureHandlerRootView style={styles.root}>
        <TaskServiceProvider service={service}>
          {withEvents(
            reminders === undefined ? (
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
            ),
          )}
        </TaskServiceProvider>
      </GestureHandlerRootView>
    );
  }

  return renderRouter(
    {
      _layout: TestLayout,
      index: TodayRoute,
      calendar: CalendarRoute,
      settings: SettingsRoute,
      future: FutureRoute,
      'task/new': NewTaskRoute,
      'task/[id]/index': TaskDetailsRoute,
      'task/[id]/edit': EditTaskRoute,
      'task/[id]/remind-later': RemindLaterRoute,
      'task/[id]/priority': ChangePriorityRoute,
      'event/new': NewEventRoute,
      'event/[id]/index': EventDetailsRoute,
      'event/[id]/edit': EditEventRoute,
      'event/[id]/remind-later': EventRemindLaterRoute,
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
