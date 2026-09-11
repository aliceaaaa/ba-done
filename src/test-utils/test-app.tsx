import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import TodayRoute from '@/app/(tabs)/index';
import EditTaskRoute from '@/app/task/[id]/edit';
import TaskDetailsRoute from '@/app/task/[id]/index';
import NewTaskRoute from '@/app/task/new';
import { migrateDatabase } from '@/database/migrations';
import type { SqlDatabase } from '@/database/sql-database';
import {
  createNodeSqliteDatabase,
  type NodeSqliteDatabase,
} from '@/database/testing/node-sqlite-database';
import { createTaskService, TaskServiceProvider, type TaskService } from '@/entities/task';

export const TEST_TIME_ZONE = 'Europe/Berlin';
export const TEST_START = '2026-09-11T08:00:00.000Z';

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
      'task/new': NewTaskRoute,
      'task/[id]/index': TaskDetailsRoute,
      'task/[id]/edit': EditTaskRoute,
    },
    { initialUrl },
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
