import { Stack } from 'expo-router';
import { act, renderRouter } from 'expo-router/testing-library';
import { Alert, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import TodayRoute from '@/app/(tabs)/index';
import FutureRoute from '@/app/future';
import EditTaskRoute from '@/app/task/[id]/edit';
import TaskDetailsRoute from '@/app/task/[id]/index';
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

export const TEST_TIME_ZONE = 'Europe/Berlin';
export const TEST_START = '2026-09-11T08:00:00.000Z';
export const TODAY = '2026-09-11';
export const TOMORROW = '2026-09-12';
export const YESTERDAY = '2026-09-10';

type TestServiceOptions = {
  start?: string;
  timeZone?: string;
  idPrefix?: string;
};

export async function createTestDatabase(): Promise<NodeSqliteDatabase> {
  const db = createNodeSqliteDatabase();
  await migrateDatabase(db);
  return db;
}

export function createTestService(db: SqlDatabase, options: TestServiceOptions = {}): TaskService {
  let current = Date.parse(options.start ?? TEST_START);
  let counter = 0;
  const prefix = options.idPrefix ?? 'id';
  const zone = options.timeZone ?? TEST_TIME_ZONE;
  return createTaskService({
    db,
    now: () => {
      current += 1000;
      return new Date(current);
    },
    generateId: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
    timeZone: () => zone,
  });
}

export function unwrap<T>(result: TaskResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error.type}: ${result.error.message}`);
  }
  return result.value;
}

export function renderApp(service: TaskService, initialUrl = '/') {
  function TestLayout() {
    return (
      <GestureHandlerRootView style={styles.root}>
        <TaskServiceProvider service={service}>
          <Stack screenOptions={{ headerShown: false }} />
        </TaskServiceProvider>
      </GestureHandlerRootView>
    );
  }

  return renderRouter(
    {
      _layout: TestLayout,
      index: TodayRoute,
      future: FutureRoute,
      'task/new': NewTaskRoute,
      'task/[id]/index': TaskDetailsRoute,
      'task/[id]/edit': EditTaskRoute,
    },
    { initialUrl },
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
