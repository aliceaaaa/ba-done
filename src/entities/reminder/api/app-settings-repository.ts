import type { SqlExecutor } from '@/database/sql-database';
import { DAY_PERIODS, type DayPeriod } from '@/entities/task';
import { isValidLocalTime } from '@/shared/lib/local-date';

import { DEFAULT_DAY_PERIOD_TIMES, type DayPeriodTimes } from '../model/types';

const DAY_PERIOD_KEY_PREFIX = 'dayPeriodTime.';
const LAST_TIME_ZONE_KEY = 'lastTimeZone';

export type AppSettingsRepository = {
  getDayPeriodTimes(): Promise<DayPeriodTimes>;
  setDayPeriodTime(period: DayPeriod, time: string): Promise<void>;
  getLastTimeZone(): Promise<string | null>;
  setLastTimeZone(timeZone: string): Promise<void>;
};

export function createAppSettingsRepository(db: SqlExecutor): AppSettingsRepository {
  async function read(key: string): Promise<string | null> {
    const row = await db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
      key,
    ]);
    return row?.value ?? null;
  }

  async function write(key: string, value: string): Promise<void> {
    await db.run(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  return {
    async getDayPeriodTimes() {
      const times: DayPeriodTimes = { ...DEFAULT_DAY_PERIOD_TIMES };
      for (const period of DAY_PERIODS) {
        const stored = await read(`${DAY_PERIOD_KEY_PREFIX}${period}`);
        if (stored !== null && isValidLocalTime(stored)) {
          times[period] = stored;
        }
      }
      return times;
    },

    async setDayPeriodTime(period, time) {
      if (!isValidLocalTime(time)) {
        throw new Error(`Invalid time "${time}" for ${period}`);
      }
      await write(`${DAY_PERIOD_KEY_PREFIX}${period}`, time);
    },

    getLastTimeZone() {
      return read(LAST_TIME_ZONE_KEY);
    },

    setLastTimeZone(timeZone) {
      return write(LAST_TIME_ZONE_KEY, timeZone);
    },
  };
}
