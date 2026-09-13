# Local notifications: manual QA checklist

Run on a development build (`npm run ios` / `npm run android`) on a physical iPhone and a physical Android 13+ phone. Use a fresh install for the permission checks.

Record for each item: device, OS version, result, notes.

## Permission

- [ ] Fresh install: the app starts without a notification permission prompt.
- [ ] Create a task without a reminder: still no prompt.
- [ ] Create a task with an exact reminder 2 minutes ahead: the system prompt appears once.
- [ ] Allow: the task card shows “Reminder scheduled”.
- [ ] Fresh install, deny: the task and reminder stay saved, a notice explains that notifications are off, “Open settings” opens the app settings page, the task card shows “Notifications are turned off”.
- [ ] Enable notifications in system settings and return to the app: the pending reminder is scheduled (card shows “Reminder scheduled”) and fires.
- [ ] iOS: provisional/quiet delivery settings still deliver to Notification Center.

## Delivery

- [ ] App in foreground: banner with “Still interested?” and the task title.
- [ ] App in background: banner delivered on time (Android 12+: may be a few minutes late without exact alarm access).
- [ ] App force-closed: notification is still delivered.
- [ ] Day-period reminder (Evening) fires at the time configured in Settings.
- [ ] A reminder time in the past cannot be saved and shows “Choose a reminder time in the future”.

## Tap and cold start

- [ ] Tap while the app is open: opens the details of the right task.
- [ ] Tap while the app is in background: opens the details of the right task.
- [ ] Force-close the app, tap the notification (cold start): the app launches on the details of the right task.
- [ ] Tap the same notification again from Notification Center (if still present): no duplicate side effects.

## Actions

Long-press (iOS) or expand (Android) the notification.

- [ ] All four actions are visible: “Done”, “Not tonight”, “Remind me later”, “Change priority”.
- [ ] Done: app opens, the task disappears from “Your matches”, history contains a completed event, no further notification for the task.
- [ ] Done on a cold start: same result.
- [ ] Not tonight: the task appears tomorrow as a Mega Crush above ranked tasks, no priority asked, the reminder fires tomorrow at the same local time.
- [ ] Remind me later: the compact picker opens with 15 minutes, 1 hour, Tonight, Tomorrow, Pick a time; choosing one keeps the task date and priority, and the new notification fires at the chosen time.
- [ ] Remind me later → Tomorrow: the task stays on today, only the reminder moves.
- [ ] Change priority on a ranked task: the current priority is available, taken ones are disabled, saving updates the deck order.
- [ ] Change priority on a Mega Crush: “Keep Mega Crush” keeps it; choosing a priority removes the Mega Crush label.

## Rescheduling and cancelling

- [ ] Edit the reminder time: only the new notification fires.
- [ ] Change the task date: the notification moves with the date.
- [ ] Swipe Done, then Undo: the reminder is scheduled again.
- [ ] Swipe Not tonight, then Undo: the reminder is back on the original date.
- [ ] Delete the task: no notification fires.
- [ ] Move a task with a reminder to Future: confirmation appears; after confirming, no notification fires.
- [ ] Change Evening in Settings: evening reminders fire at the new time, no duplicates.

## Time zone and device state

- [ ] Change the device time zone (Settings → General → Date & Time) and return to the app: the reminder keeps its local wall-clock time in the new zone.
- [ ] Reminder across a daylight saving change fires at the intended local time.
- [ ] Restart the device before the reminder time: the notification is still delivered (Android relies on the boot receiver of `expo-notifications`).
- [ ] Update the app build while a reminder is pending: the notification is still delivered.
- [ ] Android 12+: Settings shows the note about possible delays; grant “Alarms & reminders” for the app (if the build declares it) and compare timing.

## Native pickers

- [ ] iOS: date and time pickers use the compact system style and follow the device locale (12/24-hour).
- [ ] Android: tapping a date or time opens the system dialog; cancelling keeps the previous value.
- [ ] Exact time, reminder date/time, task date, Remind me later → Pick a time and Settings times all save the chosen value.
- [ ] There are no free-text `YYYY-MM-DD` or `HH:mm` fields left.
