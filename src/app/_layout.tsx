import { randomUUID } from 'expo-crypto';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { createExpoSqliteDatabase } from '@/database/expo-sqlite-database';
import { DATABASE_NAME, migrateDatabase } from '@/database/migrations';
import {
  CalendarEventServiceProvider,
  createCalendarEventService,
} from '@/entities/calendar-event';
import { createAppSettingsRepository } from '@/entities/reminder';
import { createTaskService, TaskServiceProvider } from '@/entities/task';
import {
  ReminderLifecycle,
  ReminderNoticeHost,
  ReminderProvider,
  createNotificationResponseHandler,
  createReminderCoordinator,
  createSyncedCalendarEventService,
  createSyncedTaskService,
} from '@/features/reminders';
import { createExpoNotificationAdapter } from '@/features/reminders/api/expo-notification-adapter';
import { getDeviceTimeZone } from '@/shared/lib/device-time-zone';

function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  return migrateDatabase(createExpoSqliteDatabase(db));
}

function AppServicesRoot({ children }: { children: ReactNode }) {
  const sqlite = useSQLiteContext();
  const services = useMemo(() => {
    const db = createExpoSqliteDatabase(sqlite);
    const now = () => new Date();
    const settings = createAppSettingsRepository(db);
    const taskService = createTaskService({
      db,
      now,
      generateId: randomUUID,
      timeZone: getDeviceTimeZone,
      dayPeriodTimes: () => settings.getDayPeriodTimes(),
    });
    const eventService = createCalendarEventService({
      db,
      now,
      generateId: randomUUID,
      timeZone: getDeviceTimeZone,
    });
    const adapter = createExpoNotificationAdapter();
    const coordinator = createReminderCoordinator({
      db,
      service: taskService,
      events: eventService,
      adapter,
      now,
      timeZone: getDeviceTimeZone,
    });
    const service = createSyncedTaskService(taskService, coordinator);
    const events = createSyncedCalendarEventService(eventService, coordinator);
    const handler = createNotificationResponseHandler({ db, service, events, now });
    return { adapter, coordinator, service, events, handler };
  }, [sqlite]);

  return (
    <TaskServiceProvider service={services.service}>
      <CalendarEventServiceProvider service={services.events}>
        <ReminderProvider coordinator={services.coordinator}>
          {children}
          <ReminderLifecycle
            adapter={services.adapter}
            coordinator={services.coordinator}
            handler={services.handler}
          />
          <ReminderNoticeHost coordinator={services.coordinator} />
        </ReminderProvider>
      </CalendarEventServiceProvider>
    </TaskServiceProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase}>
        <AppServicesRoot>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AppServicesRoot>
        <StatusBar style="auto" />
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
