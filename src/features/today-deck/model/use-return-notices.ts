import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useTaskService } from '@/entities/task';

export const RETURN_NOTICE_MS = 4000;

export function useReturnNotices(date: string): readonly string[] {
  const service = useTaskService();
  const [notice, setNotice] = useState<{ date: string; taskIds: string[] } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void service.claimReturnNotices(date).then((taskIds) => {
        if (active && taskIds.length > 0) {
          setNotice({ date, taskIds });
        }
      });
      return () => {
        active = false;
      };
    }, [service, date]),
  );

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), RETURN_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return notice?.date === date ? notice.taskIds : [];
}
