import { createContext, useContext, type ReactNode } from 'react';

import type { TaskService } from './task-service';

const TaskServiceContext = createContext<TaskService | null>(null);

type TaskServiceProviderProps = {
  service: TaskService;
  children: ReactNode;
};

export function TaskServiceProvider({ service, children }: TaskServiceProviderProps) {
  return <TaskServiceContext.Provider value={service}>{children}</TaskServiceContext.Provider>;
}

export function useTaskService(): TaskService {
  const service = useContext(TaskServiceContext);
  if (service === null) {
    throw new Error('TaskServiceProvider is missing');
  }
  return service;
}
