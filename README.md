# Planner

React Native + TypeScript app built with Expo (SDK 57) and Expo Router.
It runs on an **Expo Development Build** (`expo-dev-client`); Expo Go is not supported.

## Requirements

- Node.js 22.13+ (tests use the built-in `node:sqlite`)
- iOS: macOS, Xcode, CocoaPods
- Android: Android Studio, Android SDK, JDK 17

## Install

```bash
npm install
```

## Run

The first build generates `ios/` and `android/` via prebuild and installs the dev build on a simulator or device:

```bash
npm run ios
npm run android
```

Once the dev build is installed, starting Metro is enough:

```bash
npm start
```

Rebuild the native app (`npm run ios` / `npm run android`) after adding native modules or changing `app.json`.

## Checks

```bash
npm run lint       # ESLint + Prettier + file naming
npm run typecheck  # tsc --noEmit
npm test           # Jest (jest-expo)
npm run format     # Prettier auto-format
```

## Structure

```
src/
  app/        # Expo Router routes (bottom tabs live in app/(tabs))
  features/   # user scenarios
  entities/   # domain entities (task: types, validation, repository, service)
  shared/     # reusable UI and utilities
  database/   # SQL abstraction, expo-sqlite adapter, migrations
```

## Tasks domain

A task is either **scheduled** or lives in the **Future** pool. The database rejects any partially filled state.

| State              | `scheduledDate` | `placementType` | `priority` | `carryOverOrder` |
| ------------------ | --------------- | --------------- | ---------- | ---------------- |
| Future             | `null`          | `null`          | `null`     | `null`           |
| Scheduled, ranked  | date            | `ranked`        | 1–10       | `null`           |
| Scheduled, carried | date            | `carryOver`     | `null`     | ≥ 1              |

`status` is `active` or `completed`. Postponing is recorded as a `postponed` history event, not as a status.

### Deck order

1. `carryOver` tasks by `carryOverOrder` (labelled “Mega Crush”; a returned task shows “Match made in heaven”).
2. `ranked` tasks from priority 10 to 1.

Future tasks never appear in the deck and never occupy a priority.

### Rules

- `title` is required; a ranked priority is an integer from 1 to 10.
- Only one active ranked task per day can hold a priority, and only one active carry-over task per day can hold a carry-over order. Both are enforced by partial unique indexes in SQLite.
- A conflicting priority never silently shifts other tasks; the service returns a `PriorityConflict` describing the occupied position.
- `exactTime` and `dayPeriod` are mutually exclusive.
- Every write runs inside an exclusive transaction and is rolled back on failure.

### Operations

- `postponeUntilTomorrow` (swipe left, “Not tonight”): moves the task to the next local calendar day of the user as an active `carryOver` task above every ranked task, and records a `postponed` event with the previous date. Several carried tasks keep the relative order they had in the previous deck.
- `rescheduleTask`: moves a scheduled task to a chosen day with a free ranked priority.
- `scheduleFutureTask`: takes a task from the Future pool and places it on a day with a free ranked priority.
- `changePriority`: sets a free ranked priority on the same day; a carried task becomes ranked.
- `swapPriorities`: swaps two active ranked tasks of the same day atomically.
- `completeTask` (swipe right, “Done”) and `undo` for the latest Done or Not tonight.
- `createFutureTask`: creates a task without a date, priority or placement.
- `moveTaskToFuture`: returns a scheduled task to the Future pool and frees its position. If the task has a reminder, the move requires confirmation (`clearReminder`); the reminder is then cleared in the same transaction.
- `claimReturnNotices`: returns the carry-over tasks of a day whose “Match made in heaven” message has not been shown yet and records them in `carry_over_return_notices` by task and date, so the message appears once and never again after a restart. “Mega Crush” stays on every carry-over card.
- `convertCarryOverToRanked`: gives a Mega Crush task a free ranked priority.
- `editTask`: saves details and the placement change (`keep`, `ranked`, `future`) in one transaction, so a conflict never saves anything partially.
- `setThingToTakeChecked`: checks an item of the things-to-take list.
- `deleteTask`: soft delete (`deleted_at`). The task disappears from every view, its position becomes free, and its history stays in `task_events`.

### Future pool

Tasks without a date live in the Future pool (`/future`, opened from “Your matches”), newest first. They may keep an exact time, a day period or a day-period reminder, which take effect only after the task is scheduled. A reminder with a date is rejected for Future tasks.

### Task editor

One `TaskEditor` creates scheduled tasks, creates Future tasks and edits existing ones. Taken priorities are visible but disabled; the edited task's own priority stays available. Delete is available only in edit mode and asks for confirmation.

### Reminders

A reminder is `null`, an exact local date-time (`YYYY-MM-DDTHH:mm`) or a day period, always stored with the IANA time zone of the device (`getDeviceTimeZone()`). A day-period reminder fires on the task date at the time configured in Settings (defaults: Morning 09:00, Afternoon 13:00, Evening 18:00, Night 21:00).

Domain rules (`TaskService`, no notification APIs):

- An exact reminder in the past is rejected with “Choose a reminder time in the future”.
- Not tonight moves an exact reminder by the same number of calendar days as the task; Undo moves it back.
- `snoozeReminder` (Remind me later) changes only the reminder, never the date, priority or placement, and records a `reminderSnoozed` event.
- `rebaseReminderTimeZones` keeps the local wall-clock time and switches the stored time zone.

## Local notifications

SQLite is the source of truth; the OS only holds scheduled notifications. No push notifications, tokens or backend.

| Piece                         | Location                                                        | Responsibility                                                                                        |
| ----------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `NotificationAdapter`         | `src/features/reminders/model/notification-adapter.ts`          | The only boundary to the OS. `expo-notifications` is used only in `api/expo-notification-adapter.ts`. |
| `ReminderCoordinator`         | `src/features/reminders/model/reminder-coordinator.ts`          | Plans, schedules, cancels and reconciles notifications; stores the state in `reminder_schedules`.     |
| Synced task service           | `src/features/reminders/model/synced-task-service.ts`           | Wraps `TaskService`; after every successful change it syncs the reminder of the affected tasks.       |
| `NotificationResponseHandler` | `src/features/reminders/model/notification-response-handler.ts` | Handles taps and actions through the same `TaskService`, deduplicated in `notification_responses`.    |
| `ReminderLifecycle`           | `src/features/reminders/ui/reminder-lifecycle.tsx`              | Startup, foreground, cold start and response listeners.                                               |

### Schedule state

`reminder_schedules` keeps `scheduledNotificationId`, `reminderScheduleStatus` (`notScheduled`, `scheduled`, `permissionDenied`, `failed`), `reminderScheduledAt`, `reminderScheduleError`, the planned `fireAt` and a fingerprint. Every notification uses the deterministic identifier `task-reminder-<taskId>`, so rescheduling replaces instead of duplicating. The payload contains `kind`, `version`, `taskId`, `scheduledDate`, `reminderType`, `url` (`/task/<id>`), `fireAt` and `fingerprint`.

Saving a task always commits SQLite first. If the OS call fails, the task and reminder stay saved, the status becomes `failed` with the technical message in `reminderScheduleError` (never shown in the UI), and `reconcileReminders` retries later.

### Reconcile

`reconcile()` runs on startup, when the app returns to the foreground, after permission is granted and after a time zone change (`refresh()`). It loads active reminders from SQLite, lists the app's scheduled notifications, cancels app notifications without a matching task (notifications without the app payload are never touched), recreates missing or stale ones and updates the stored status. Running it repeatedly does not create duplicates.

### Permissions

Permission is never requested at startup. It is requested when a reminder is saved for the first time. If it is denied, the task and reminder are saved, the status is `permissionDenied`, a non-blocking notice offers “Open settings”, and the next foreground reconcile schedules pending reminders once access is granted. iOS provisional and ephemeral authorization count as granted; Android 12 and below grant notifications at install, Android 13+ asks for `POST_NOTIFICATIONS`.

### Actions

The `task-reminder` category has four actions: “Done”, “Not tonight”, “Remind me later”, “Change priority”. All of them open the app (`opensAppToForeground: true`) so that every action runs through the same handler and `TaskService`, also after a cold start; there is no separate background business logic.

- Tap: opens `/task/<id>`.
- Done: `completeTask`, cancels the notification; ignored if the task is already completed.
- Not tonight: `postponeUntilTomorrow`, reschedules for the new date; ignored if the task already left the notified date.
- Remind me later: opens `/task/<id>/remind-later` with 15 minutes, 1 hour, Tonight (Night time today), Tomorrow (Morning time tomorrow) and Pick a time.
- Change priority: opens `/task/<id>/priority`; a Mega Crush task can be kept or converted with `convertCarryOverToRanked`.

### Android

- Reminders use the `reminders` channel (high importance), also set as the default channel in `app.json`.
- `expo-notifications` restores scheduled notifications after reboot and app updates (`RECEIVE_BOOT_COMPLETED`, declared by the library).
- On Android 12+ (API 31+) exact alarms require the special “Alarms & reminders” access. The app does not declare `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM`: `expo-notifications` then falls back to an inexact alarm, so delivery may be delayed by a few minutes. Settings shows this note on Android 12+ and the app never promises minute-exact delivery there.

### Native pickers

Dates and times are edited with `@react-native-community/datetimepicker` (compact picker on iOS, system dialog on Android) and stored as normalized `YYYY-MM-DD` / `HH:mm` values. They are displayed in the device locale.

### Rebuild required

`expo-notifications` and `@react-native-community/datetimepicker` are native modules, and `app.json` gained the `expo-notifications` plugin. Rebuild the development build with `npm run ios` / `npm run android`. A manual QA checklist lives in [docs/notifications-manual-qa.md](docs/notifications-manual-qa.md).

### Required UI copy

All required strings live in `src/shared/config/ui-strings.ts` and must be used verbatim.

## File naming

Files and folders use kebab-case only: `screen-title.tsx`, `use-today-tasks.ts`.
Exceptions are Expo Router special names (`_layout.tsx`, `+not-found.tsx`, `[id].tsx`, `(tabs)` groups) and `__tests__`.
`npm run lint` enforces this via `eslint-plugin-check-file`.
