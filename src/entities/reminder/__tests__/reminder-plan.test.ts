import type { RankedTask } from '@/entities/task';

import { buildSnoozeOptions } from '../lib/snooze-options';
import { parseReminderPayload, planReminder, reminderNotificationId } from '../lib/reminder-plan';
import { DEFAULT_DAY_PERIOD_TIMES } from '../model/types';

const NOW = new Date('2026-09-11T08:00:00.000Z');

function buildTask(overrides: Partial<RankedTask> = {}): RankedTask {
  return {
    id: 'task-1',
    title: 'Dentist',
    description: null,
    status: 'active',
    scheduledDate: '2026-09-11',
    placementType: 'ranked',
    priority: 5,
    carryOverOrder: null,
    exactTime: null,
    dayPeriod: null,
    durationMinutes: null,
    address: null,
    travelMinutes: null,
    thingsToTake: [],
    reminder: { type: 'exact', localDateTime: '2026-09-11T19:30', timeZone: 'Europe/Berlin' },
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    completedAt: null,
    ...overrides,
  };
}

describe('planReminder', () => {
  it('turns an exact reminder into a date trigger in its time zone', () => {
    const plan = planReminder(buildTask(), DEFAULT_DAY_PERIOD_TIMES, NOW);

    expect(plan).toMatchObject({
      kind: 'notify',
      identifier: reminderNotificationId('task-1'),
      title: 'Still interested?',
      body: 'Dentist',
      payload: {
        kind: 'task-reminder',
        version: 1,
        taskId: 'task-1',
        scheduledDate: '2026-09-11',
        reminderType: 'exact',
        url: '/task/task-1',
        fireAt: '2026-09-11T17:30:00.000Z',
      },
    });
    expect(plan.kind === 'notify' && plan.fireAt.toISOString()).toBe('2026-09-11T17:30:00.000Z');
  });

  it('uses the configured time of a day period on the task date', () => {
    const task = buildTask({
      reminder: { type: 'dayPeriod', period: 'evening', timeZone: 'America/New_York' },
    });

    const plan = planReminder(task, { ...DEFAULT_DAY_PERIOD_TIMES, evening: '19:15' }, NOW);

    expect(plan.kind === 'notify' && plan.fireAt.toISOString()).toBe('2026-09-11T23:15:00.000Z');
  });

  it('marks a reminder in the past instead of scheduling it', () => {
    const task = buildTask({
      reminder: { type: 'dayPeriod', period: 'morning', timeZone: 'Europe/Berlin' },
    });

    expect(planReminder(task, DEFAULT_DAY_PERIOD_TIMES, NOW)).toEqual({
      kind: 'inPast',
      fireAt: new Date('2026-09-11T07:00:00.000Z'),
    });
  });

  it('never plans a notification for Future, completed or reminder-less tasks', () => {
    const future = {
      ...buildTask(),
      scheduledDate: null,
      placementType: null,
      priority: null,
      carryOverOrder: null,
      reminder: { type: 'dayPeriod', period: 'evening', timeZone: 'Europe/Berlin' },
    } as const;

    expect(planReminder(future, DEFAULT_DAY_PERIOD_TIMES, NOW)).toEqual({ kind: 'none' });
    expect(
      planReminder(
        buildTask({ status: 'completed', completedAt: NOW.toISOString() }),
        DEFAULT_DAY_PERIOD_TIMES,
        NOW,
      ),
    ).toEqual({ kind: 'none' });
    expect(planReminder(buildTask({ reminder: null }), DEFAULT_DAY_PERIOD_TIMES, NOW)).toEqual({
      kind: 'none',
    });
    expect(planReminder(null, DEFAULT_DAY_PERIOD_TIMES, NOW)).toEqual({ kind: 'none' });
  });

  it('validates notification payloads', () => {
    const plan = planReminder(buildTask(), DEFAULT_DAY_PERIOD_TIMES, NOW);
    const payload = plan.kind === 'notify' ? plan.payload : null;

    expect(parseReminderPayload({ ...payload })).toEqual(payload);
    expect(parseReminderPayload({ ...payload, version: 2 })).toBeNull();
    expect(parseReminderPayload({ ...payload, taskId: '' })).toBeNull();
    expect(parseReminderPayload({ kind: 'other' })).toBeNull();
    expect(parseReminderPayload(null)).toBeNull();
  });
});

describe('buildSnoozeOptions', () => {
  it('offers local times that do not move the task', () => {
    const options = buildSnoozeOptions(
      new Date('2026-09-11T08:07:30.000Z'),
      'Europe/Berlin',
      DEFAULT_DAY_PERIOD_TIMES,
    );

    expect(options).toEqual([
      { key: 'in15Minutes', label: '15 minutes', localDateTime: '2026-09-11T10:23' },
      { key: 'in1Hour', label: '1 hour', localDateTime: '2026-09-11T11:08' },
      { key: 'tonight', label: 'Tonight', localDateTime: '2026-09-11T21:00' },
      { key: 'tomorrow', label: 'Tomorrow', localDateTime: '2026-09-12T09:00' },
    ]);
  });

  it('disables Tonight once the night time has passed', () => {
    const [, , tonight] = buildSnoozeOptions(
      new Date('2026-09-11T20:30:00.000Z'),
      'Europe/Berlin',
      DEFAULT_DAY_PERIOD_TIMES,
    );

    expect(tonight).toEqual({ key: 'tonight', label: 'Tonight', localDateTime: null });
  });
});
