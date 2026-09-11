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
import { getDeviceTimeZone } from '@/shared/lib/device-time-zone';

function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  return migrateDatabase(createExpoSqliteDatabase(db));
}

function TaskServiceRoot({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const service = useMemo(
    () =>
      createTaskService({
        db: createExpoSqliteDatabase(db),
        now: () => new Date(),
        generateId: randomUUID,
        timeZone: getDeviceTimeZone,
      }),
    [db],
  );
  return <TaskServiceProvider service={service}>{children}</TaskServiceProvider>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase}>
        <TaskServiceRoot>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </TaskServiceRoot>
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
