import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

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

  return { deck, reload };
}
