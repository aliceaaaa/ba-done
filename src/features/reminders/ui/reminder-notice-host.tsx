import { useCallback, useEffect, useState } from 'react';

import { NoticeBar } from '@/shared/ui/notice-bar';

import type { ReminderCoordinator, ReminderSyncOutcome } from '../model/reminder-coordinator';

export const REMINDER_NOTICES = {
  permissionDenied: 'Notifications are turned off. Your reminder is saved but will not alert you.',
  failed: 'The reminder could not be scheduled. The app will try again later.',
  inPast: 'The reminder time is already in the past. Choose a future time.',
} as const;

type NoticeKind = keyof typeof REMINDER_NOTICES;

function noticeFor(outcome: ReminderSyncOutcome): NoticeKind | null {
  return outcome === 'permissionDenied' || outcome === 'failed' || outcome === 'inPast'
    ? outcome
    : null;
}

type ReminderNoticeHostProps = {
  coordinator: ReminderCoordinator;
};

export function ReminderNoticeHost({ coordinator }: ReminderNoticeHostProps) {
  const [notice, setNotice] = useState<NoticeKind | null>(null);

  useEffect(
    () =>
      coordinator.subscribe((event) => {
        const kind = noticeFor(event.outcome);
        if (event.requested && kind !== null) {
          setNotice(kind);
        }
      }),
    [coordinator],
  );

  const dismiss = useCallback(() => setNotice(null), []);

  if (notice === null) {
    return null;
  }

  return (
    <NoticeBar
      message={REMINDER_NOTICES[notice]}
      {...(notice === 'permissionDenied'
        ? {
            actionLabel: 'Open settings',
            onAction: () => {
              setNotice(null);
              void coordinator.openSettings();
            },
          }
        : {})}
      onDismiss={dismiss}
    />
  );
}
