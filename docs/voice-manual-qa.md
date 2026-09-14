# Lists and voice commands: manual QA checklist

Run on a development build (`npm run ios` / `npm run android`) rebuilt after installing `expo-speech-recognition`. Use a physical iPhone (iOS 16.4+) and a physical Android phone with the Google app installed (Android 13+ recommended, Android 7+ supported). Simulators and emulators are not enough: they have no real microphone path and often no recognition service.

Record for each item: device, OS version, recognition language, network state, result, notes.

This version has **no wake word while the app is closed or in the background**. The hands-free mode listens only while the app is open and on screen.

Spoken Russian phrases below are test input for the Russian recognizer; the English translation is given in brackets.

## Setup

- [ ] Fresh install: the app starts without a microphone or speech recognition prompt.
- [ ] Open Lists: “Shopping” exists and is shown first.
- [ ] Settings → Voice: the hands-free switch is off, the permission status says access is requested on first use, “Voice history is empty” after “Delete voice history”.

## Permissions

- [ ] Tap the microphone on “Your matches”: iOS asks for Microphone and then Speech Recognition, Android asks for the microphone. The texts mention voice commands and that audio is not stored.
- [ ] Allow: the listening panel shows “Listening” and the partial transcript.
- [ ] Fresh install, deny: the panel says access is off and offers “Open settings”; the button opens the app page in system settings. Typing, “New task” and list input still work.
- [ ] Allow access in system settings, return to the app, tap the microphone: listening starts without a restart.
- [ ] Revoke access while hands-free is on, return to the app: hands-free stops with “microphone or speech access is off”.

## Languages

- [ ] Settings → Voice → English. “Add milk to Shopping” adds “Milk” to Shopping.
- [ ] Settings → Voice → Russian. «Добавь масло в список покупок» [add butter to the shopping list] adds the item to Shopping.
- [ ] Device language: the recognizer uses the device language; commands in English and Russian are understood.
- [ ] An unsupported recognizer language shows “Voice input unavailable” and never crashes.

## Environment

- [ ] Quiet room: 10 commands from the list below, note how many are recognized correctly.
- [ ] Street or background noise (TV, café): same 10 commands, note misrecognitions; nothing is saved without Preview for tasks and events.
- [ ] Bluetooth headphones (AirPods or similar): recognition uses the headset microphone; music playback resumes after listening stops.
- [ ] Airplane mode: iOS and Android either recognize on device (if the language model is installed) or show a clear error; the app never promises offline recognition and never hangs.
- [ ] Recognition service unavailable (Android: disable the Google app; iOS: turn off Siri & Dictation): the microphone shows “Voice input unavailable”, manual input works.

## Session control

- [ ] Tap the microphone, then “Cancel”: nothing is saved, the panel closes.
- [ ] Tap the microphone, speak, tap “Stop listening”: the state changes to “Processing”, then the command is handled once.
- [ ] Tap the microphone twice quickly: only one listening session starts.
- [ ] Incoming phone call or FaceTime during listening: listening stops, no command is saved from the partial text.
- [ ] Start a voice memo or video call in another app, return: the app does not keep the audio session.
- [ ] Foreground → background (home gesture) while listening: listening stops immediately (the microphone indicator in the status bar disappears).
- [ ] Cold launch after force close: no microphone indicator until the user taps the microphone or “Start” in the hands-free banner.

## Destinations

- [ ] List item, unambiguous: «Добавь две бутылки воды в Shopping» [add two bottles of water to Shopping] → saved at once, notice with “Undo” and “Open”; Undo removes the item.
- [ ] List item inside a list: open a list, tap its microphone, say “bread” → added to that list.
- [ ] «В список аптека — аспирин» [to the pharmacy list — aspirin] with an existing “Аптека” list → added to it.
- [ ] Future task: «Добавь задачу забрать куртку» [add a task to pick up the jacket] and “Add a future task to renew my passport” → appear in Future without priority, Undo removes them.
- [ ] Ranked task: «Добавь на сегодня забрать посылку, приоритет три» [add for today pick up the parcel, priority three] → Preview → Save → appears in “Your matches” today with priority 3.
- [ ] “Add call John tomorrow” → Preview highlights “Priority”; the priority picker shows taken positions as disabled; save with a free one.
- [ ] Calendar event: «Встреча с Анной завтра в 15:00 на час» [meeting with Anna tomorrow at 15:00 for an hour] → Preview with 15:00–16:00 → Save → visible in Calendar.
- [ ] “Create an event tomorrow at 4 PM for 30 minutes” → Preview highlights “Title”.
- [ ] Event without end: “Create an event dentist next friday at 9 am” → Preview shows the suggested end one hour later; nothing is saved until “Save”.
- [ ] Task or event: «Стоматолог завтра в 12» [dentist tomorrow at 12] → Preview asks to choose Task or Event.
- [ ] Exact reminder: “Remind me tomorrow at 9 to send the report” → Preview shows the reminder; after saving, the notification fires.
- [ ] Reminder in the past: «Напомни сегодня в 6:00 купить билеты, приоритет 2» [remind me today at 6:00 to buy tickets, priority 2] after 06:00 → “Choose a reminder time in the future”, nothing is moved automatically.

## Ambiguity

- [ ] Priority conflict: create a task with priority 7 tomorrow, then say “Tomorrow call mom priority seven” → Save shows who holds priority 7 and the free positions; existing tasks keep their priorities.
- [ ] Unknown list: “Add water to Groceries” with no Groceries list → Preview offers existing lists and “Create list”; no list exists until Save.
- [ ] Similar lists: create “Trip Italy” and “Trip Spain”, say “Add sunscreen to trip list” → Preview asks to choose.
- [ ] Unrecognized date: “Create an event on 31 February at 10” → the transcript stays visible, the start field is highlighted.

## Hands-free (app open only)

- [ ] Settings → Voice → turn on “Listen for “Hey app” while the app is open”: permission is requested if needed; the banner says hands-free is on and waits for “Start”.
- [ ] Tap “Start”: the banner shows “Listening for “Hey app”” and the system microphone indicator is visible.
- [ ] Speak without the wake phrase: nothing happens, listening continues.
- [ ] “Hey app, add eggs to Shopping”: the item is added, then the banner returns to listening.
- [ ] «Эй, приложение, завтра позвонить маме, приоритет семь» [hey app, tomorrow call mom, priority seven]: Preview opens; listening resumes after Save or Cancel.
- [ ] Tap “Stop listening” in the banner: listening stops at once.
- [ ] Stay silent for several minutes: hands-free pauses “to save battery” instead of restarting forever.
- [ ] Airplane mode with a recognizer that needs the network: retries slow down and stop after repeated errors.
- [ ] Android: note the start/stop sound of SpeechRecognizer on each restart and battery usage over 15 minutes.
- [ ] Send the app to the background and back: hands-free is paused and does not resume without “Resume”.
- [ ] Phone call while hands-free listens: hands-free stops.
- [ ] Turn the switch off: the banner disappears, no microphone indicator.

## Lists without voice

- [ ] Create a custom list with a color and icon; rename it; archive it; open “Archived lists”; restore it.
- [ ] Shopping cannot be deleted while it is the only shopping list.
- [ ] Type an item and press Done/Enter repeatedly: every press adds an item and the keyboard stays open.
- [ ] Check, uncheck, move up/down, edit quantity/unit/note, delete an item.
- [ ] Collapse and expand “Completed”; “Clear completed” asks for confirmation.
- [ ] Long item and list titles wrap without being cut.

## Accessibility

- [ ] Largest system text size (iOS Larger Accessibility Sizes, Android font size max): lists, list screen, Preview, Settings → Voice and banners stay usable without clipped buttons.
- [ ] VoiceOver: the microphone is announced as “Start listening”, “Stop listening” with value “Listening”, “Processing”, or “Voice input unavailable”; checkbox state of list items is announced; the hands-free banner is read when it changes.
- [ ] TalkBack: the same labels and states; Preview warnings are announced as alerts.
- [ ] States are readable without color: the listening button shows “Stop”, the banner shows a text status.
