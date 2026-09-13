import { randomUUID } from 'expo-crypto';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { createExpoSqliteDatabase } from '@/database/expo-sqlite-database';
import { DATABASE_NAME, migrateDatabase } from '@/database/migrations';
import { createTaskService, TaskServiceProvider } from '@/entities/task';
import {
  ReminderLifecycle,
  ReminderNoticeHost,
  ReminderProvider,
  createNotificationResponseHandler,
  createReminderCoordinator,
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
    const taskService = createTaskService({
      db,
      now,
      generateId: randomUUID,
      timeZone: getDeviceTimeZone,
    });
    const adapter = createExpoNotificationAdapter();
    const coordinator = createReminderCoordinator({
      db,
      service: taskService,
      adapter,
      now,
      timeZone: getDeviceTimeZone,
    });
    const service = createSyncedTaskService(taskService, coordinator);
    const handler = createNotificationResponseHandler({ db, service, now });
    return { adapter, coordinator, service, handler };
  }, [sqlite]);

  return (
    <TaskServiceProvider service={services.service}>
      <ReminderProvider coordinator={services.coordinator}>
        {children}
        <ReminderLifecycle
          adapter={services.adapter}
          coordinator={services.coordinator}
          handler={services.handler}
        />
        <ReminderNoticeHost coordinator={services.coordinator} />
      </ReminderProvider>
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
