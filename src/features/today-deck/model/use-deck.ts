import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useTaskService, type ScheduledTask } from '@/entities/task';

export function useDeck(date: string) {
  const service = useTaskService();
  const [deck, setDeck] = useState<ScheduledTask[] | null>(null);

  const reload = useCallback(async () => {
    setDeck(await service.getDeck(date));
  }, [service, date]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(
    () =>
      service.onChange(() => {
        void reload();
      }),
    [service, reload],
  );

  return { deck, reload };
}
