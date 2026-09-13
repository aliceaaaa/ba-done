import { useEffect, useRef, useState } from 'react';

import { useTaskService } from '@/entities/task';

export const RETURN_NOTICE_MS = 4000;

type ReturnNotice = {
  date: string;
  taskIds: string[];
};

export function useReturnNotices(date: string): readonly string[] {
  const service = useTaskService();
  const [notice, setNotice] = useState<ReturnNotice | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void service.claimReturnNotices(date).then((taskIds) => {
      if (!mounted.current) {
        return;
      }
      setNotice((current) => {
        if (taskIds.length > 0) {
          return { date, taskIds };
        }
        return current?.date === date ? null : current;
      });
    });
  }, [service, date]);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), RETURN_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return notice?.date === date ? notice.taskIds : [];
}
