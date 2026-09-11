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
- `moveTaskToFuture`: returns a scheduled task to the Future pool and frees its position. A reminder with a date must be turned off explicitly (`clearDatedReminder`).
- `convertCarryOverToRanked`: gives a Mega Crush task a free ranked priority.
- `editTask`: saves details and the placement change (`keep`, `ranked`, `future`) in one transaction, so a conflict never saves anything partially.
- `setThingToTakeChecked`: checks an item of the things-to-take list.
- `deleteTask`: soft delete (`deleted_at`). The task disappears from every view, its position becomes free, and its history stays in `task_events`.

### Future pool

Tasks without a date live in the Future pool (`/future`, opened from “Your matches”), newest first. They may keep an exact time, a day period or a day-period reminder, which take effect only after the task is scheduled. A reminder with a date is rejected for Future tasks.

### Task editor

One `TaskEditor` creates scheduled tasks, creates Future tasks and edits existing ones. Taken priorities are visible but disabled; the edited task's own priority stays available. Delete is available only in edit mode and asks for confirmation.

### Reminders

A reminder is `null`, an exact local date-time (`YYYY-MM-DDTHH:mm`) or a day period, always stored with the IANA time zone of the device (`getDeviceTimeZone()`). Notifications themselves are scheduled by the OS with the text “Still interested?” and the actions Done, Not tonight, Remind me later, Change priority.

### Required UI copy

All required strings live in `src/shared/config/ui-strings.ts` and must be used verbatim.

## File naming

Files and folders use kebab-case only: `screen-title.tsx`, `use-today-tasks.ts`.
Exceptions are Expo Router special names (`_layout.tsx`, `+not-found.tsx`, `[id].tsx`, `(tabs)` groups) and `__tests__`.
`npm run lint` enforces this via `eslint-plugin-check-file`.
