import { Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import CalendarRoute from '@/app/(tabs)/calendar';
import TodayRoute from '@/app/(tabs)/index';
import ListsRoute from '@/app/(tabs)/lists';
import SettingsRoute from '@/app/(tabs)/settings';
import EditEventRoute from '@/app/event/[id]/edit';
import EventDetailsRoute from '@/app/event/[id]/index';
import EventRemindLaterRoute from '@/app/event/[id]/remind-later';
import NewEventRoute from '@/app/event/new';
import FutureRoute from '@/app/future';
import EditListItemRoute from '@/app/list-item/[id]';
import EditListRoute from '@/app/list/[id]/edit';
import ListRoute from '@/app/list/[id]/index';
import ArchivedListsRoute from '@/app/list/archived';
import NewListRoute from '@/app/list/new';
import EditTaskRoute from '@/app/task/[id]/edit';
import TaskDetailsRoute from '@/app/task/[id]/index';
import ChangePriorityRoute from '@/app/task/[id]/priority';
import RemindLaterRoute from '@/app/task/[id]/remind-later';
import NewTaskRoute from '@/app/task/new';
import VoiceCommandRoute from '@/app/voice-command';
import VoiceEntryRoute from '@/app/voice-entry';
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
import {
  ListServiceProvider,
  createListService,
  type ListResult,
  type ListService,
} from '@/entities/list';
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
import {
  SystemVoiceEntryHost,
  SystemVoiceEntryProvider,
  createSystemVoiceEntryServices,
  type SystemVoiceEntryServices,
} from '@/features/system-voice-entry';
import {
  createFakeNativeVoiceEntryBridge,
  type FakeNativeVoiceEntryBridge,
} from '@/features/system-voice-entry/testing/fake-native-voice-entry-bridge';
import {
  VoiceHost,
  VoiceProvider,
  createVoiceServices,
  createVoiceSettingsRepository,
  type VoiceServices,
} from '@/features/voice';
import {
  createFakeAppState,
  createManualScheduler,
  type FakeAppState,
  type ManualScheduler,
} from '@/features/voice/testing/fake-app-state';
import {
  createFakeSpeechRecognitionAdapter,
  type FakeSpeechOptions,
  type FakeSpeechRecognitionAdapter,
} from '@/features/voice/testing/fake-speech-recognition-adapter';

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

export type TestVoice = {
  services: VoiceServices;
  adapter: FakeSpeechRecognitionAdapter;
  appState: FakeAppState;
  scheduler: ManualScheduler;
  openSettings: jest.Mock<Promise<void>, []>;
};

type TestVoiceOptions = FakeSpeechOptions & {
  tasks: TaskService;
  events: CalendarEventService;
  lists: ListService;
  deviceLocale?: string;
  start?: string;
};

export function createTestVoice(db: SqlDatabase, options: TestVoiceOptions): TestVoice {
  const adapter = createFakeSpeechRecognitionAdapter(options);
  const appState = createFakeAppState();
  const scheduler = createManualScheduler();
  const openSettings = jest.fn(async () => undefined);
  const services = createVoiceServices({
    adapter,
    appState,
    scheduler,
    tasks: options.tasks,
    events: options.events,
    lists: options.lists,
    settingsRepository: createVoiceSettingsRepository(db),
    now: createTestClock(options.start),
    timeZone: () => TEST_TIME_ZONE,
    deviceLocale: () => options.deviceLocale ?? 'en-US',
    openSettings,
  });
  return { services, adapter, appState, scheduler, openSettings };
}

export type TestSystemVoiceEntry = {
  services: SystemVoiceEntryServices;
  bridge: FakeNativeVoiceEntryBridge;
  openVoiceSettings: jest.Mock<Promise<void>, []>;
  openShortcutsApp: jest.Mock<Promise<void>, []>;
};

type TestSystemVoiceEntryOptions = {
  voice: TestVoice;
  lists: ListService;
  now?: () => Date;
  bridge?: FakeNativeVoiceEntryBridge;
};

export function createTestSystemVoiceEntry(
  db: SqlDatabase,
  options: TestSystemVoiceEntryOptions,
): TestSystemVoiceEntry {
  const bridge = options.bridge ?? createFakeNativeVoiceEntryBridge();
  const openVoiceSettings = jest.fn(async () => undefined);
  const openShortcutsApp = jest.fn(async () => undefined);
  const services = createSystemVoiceEntryServices({
    db,
    voice: options.voice.services,
    lists: options.lists,
    bridge,
    now: options.now ?? createTestClock(),
    timeZone: () => TEST_TIME_ZONE,
    generateId: createIdGenerator('entry-generated'),
    openVoiceSettings,
    openShortcutsApp,
  });
  return { services, bridge, openVoiceSettings, openShortcutsApp };
}

type RenderAppOptions = {
  lists?: ListService;
  voice?: TestVoice;
  systemVoiceEntry?: TestSystemVoiceEntry;
};

export function renderApp(
  service: TaskService,
  initialUrl = '/',
  reminders?: TestReminders,
  eventService?: CalendarEventService,
  options: RenderAppOptions = {},
) {
  const events = reminders?.events ?? eventService;
  const { lists, voice, systemVoiceEntry } = options;

  function withEvents(children: ReactNode) {
    return events === undefined ? (
      children
    ) : (
      <CalendarEventServiceProvider service={events}>{children}</CalendarEventServiceProvider>
    );
  }

  function withListsAndVoice(children: ReactNode) {
    const withVoice =
      voice === undefined ? (
        children
      ) : (
        <VoiceProvider services={voice.services}>
          {systemVoiceEntry === undefined ? (
            <>
              {children}
              <VoiceHost />
            </>
          ) : (
            <SystemVoiceEntryProvider services={systemVoiceEntry.services}>
              {children}
              <VoiceHost />
              <SystemVoiceEntryHost />
            </SystemVoiceEntryProvider>
          )}
        </VoiceProvider>
      );
    return lists === undefined ? (
      withVoice
    ) : (
      <ListServiceProvider service={lists}>{withVoice}</ListServiceProvider>
    );
  }

  function TestLayout() {
    const stack = withListsAndVoice(<Stack screenOptions={{ headerShown: false }} />);
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
      lists: ListsRoute,
      'list/new': NewListRoute,
      'list/archived': ArchivedListsRoute,
      'list/[id]/index': ListRoute,
      'list/[id]/edit': EditListRoute,
      'list-item/[id]': EditListItemRoute,
      'voice-command': VoiceCommandRoute,
      'voice-entry': VoiceEntryRoute,
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
