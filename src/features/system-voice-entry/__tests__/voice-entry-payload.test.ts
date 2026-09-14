import * as fs from 'node:fs';
import * as path from 'node:path';

import { toNativeVoiceEntryItem } from '../api/native-voice-entry-bridge';
import {
  VOICE_ENTRY_ACTIONS,
  VOICE_ENTRY_LIMITS,
  VOICE_ENTRY_PAYLOAD_KEYS,
} from '../model/voice-entry-intent';
import {
  VOICE_ENTRY_URL_PARAMS,
  parseVoiceEntryPayload,
  payloadFromUrlParams,
  sourceFromUrlParams,
  type VoiceEntryRejectionReason,
} from '../model/voice-entry-payload';

const NOW = new Date('2026-09-11T08:00:00.000Z');
const ROOT = path.resolve(__dirname, '../../../..');

function context(source: 'iosAppIntent' | 'deepLink' | 'shortcut' = 'iosAppIntent') {
  return { source, now: NOW, generateId: () => 'generated-id-1' };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    version: '1',
    intentId: '6F9619FF-8B86-D011-B42D-00C04FC964FF',
    action: 'captureFutureTask',
    text: 'Renew my passport',
    locale: 'en-US',
    createdAt: '2026-09-11T07:59:30Z',
    ...overrides,
  };
}

function rejection(raw: unknown, source?: 'iosAppIntent' | 'deepLink'): VoiceEntryRejectionReason {
  const result = parseVoiceEntryPayload(raw, context(source));
  if (result.ok) {
    throw new Error('Expected a rejection');
  }
  return result.error.reason;
}

describe('parseVoiceEntryPayload', () => {
  it('accepts a valid versioned payload and ignores unknown fields', () => {
    const result = parseVoiceEntryPayload(
      payload({
        listName: ' Groceries ',
        date: '2026-09-12',
        time: '16:30',
        durationMinutes: '45',
        priority: 7,
        sql: 'DROP TABLE tasks',
        nested: { action: 'delete' },
      }),
      context(),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        id: '6F9619FF-8B86-D011-B42D-00C04FC964FF',
        source: 'iosAppIntent',
        action: 'captureFutureTask',
        text: 'Renew my passport',
        listName: 'Groceries',
        date: '2026-09-12',
        time: '16:30',
        durationMinutes: 45,
        priority: 7,
        locale: 'en-US',
        createdAt: '2026-09-11T07:59:30Z',
        receivedAt: NOW.toISOString(),
      },
    });
  });

  it('rejects an unknown version', () => {
    expect(rejection(payload({ version: '2' }))).toBe('unsupportedVersion');
    expect(rejection(payload({ version: undefined }))).toBe('unsupportedVersion');
    expect(rejection('version=1')).toBe('notAnObject');
  });

  it('rejects an unknown action, including destructive ones', () => {
    for (const action of ['delete', 'deleteTask', 'completeTask', 'done', 'notTonight', 'Done']) {
      expect(rejection(payload({ action }))).toBe('unknownAction');
    }
  });

  it('rejects text and list names that are too long or contain control characters', () => {
    const tooLong = 'a'.repeat(VOICE_ENTRY_LIMITS.maxTextLength + 1);
    expect(rejection(payload({ text: tooLong }))).toBe('invalidText');
    expect(rejection(payload({ text: 'Milk\u0000' }))).toBe('invalidText');
    expect(rejection(payload({ text: 42 }))).toBe('invalidText');
    expect(
      rejection(payload({ listName: 'b'.repeat(VOICE_ENTRY_LIMITS.maxListNameLength + 1) })),
    ).toBe('invalidListName');
    expect(
      parseVoiceEntryPayload(
        payload({ text: 'a'.repeat(VOICE_ENTRY_LIMITS.maxTextLength) }),
        context(),
      ).ok,
    ).toBe(true);
  });

  it('rejects invalid dates and times', () => {
    expect(rejection(payload({ date: '2026-02-30' }))).toBe('invalidDate');
    expect(rejection(payload({ date: 'tomorrow' }))).toBe('invalidDate');
    expect(rejection(payload({ time: '24:00' }))).toBe('invalidTime');
    expect(rejection(payload({ time: '9:5' }))).toBe('invalidTime');
  });

  it('accepts only an integer priority from 1 to 10 and a bounded duration', () => {
    for (const priority of [0, 11, -1, 3.5, '3.5', 'high', '1e1']) {
      expect(rejection(payload({ priority }))).toBe('invalidPriority');
    }
    expect(rejection(payload({ durationMinutes: 0 }))).toBe('invalidDuration');
    expect(rejection(payload({ durationMinutes: 1441 }))).toBe('invalidDuration');
  });

  it('rejects an expired payload and one from the future beyond clock skew', () => {
    expect(rejection(payload({ createdAt: '2026-09-11T07:49:59Z' }))).toBe('expired');
    expect(rejection(payload({ createdAt: '2026-09-11T08:02:01Z' }))).toBe('expired');
    expect(rejection(payload({ createdAt: 'yesterday' }))).toBe('invalidCreatedAt');
  });

  it('requires an intent id and creation time from native system sources', () => {
    expect(rejection(payload({ intentId: undefined }))).toBe('missingIntentId');
    expect(rejection(payload({ createdAt: undefined }))).toBe('invalidCreatedAt');
    expect(rejection(payload({ intentId: '../../etc' }))).toBe('invalidIntentId');
    expect(rejection(payload({ locale: 'en-US; rm -rf' }))).toBe('invalidLocale');
  });

  it('accepts static deep links without id or creation time and generates an id', () => {
    const result = parseVoiceEntryPayload(
      payloadFromUrlParams({ v: '1', action: 'openVoiceCapture', entry: 'shortcut' }),
      context('shortcut'),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { id: 'generated-id-1', action: 'openVoiceCapture', createdAt: null },
    });
  });

  it('maps only allowlisted URL parameters and never trusts the source claimed by a link', () => {
    const params = {
      v: '1',
      action: 'addListItem',
      text: ['Milk', 'Bread'],
      list: 'Shopping',
      payload: '{"action":"delete"}',
      source: 'iosAppIntent',
    };

    expect(payloadFromUrlParams(params)).toEqual({
      version: '1',
      action: 'addListItem',
      text: 'Milk',
      listName: 'Shopping',
    });
    expect(sourceFromUrlParams(params)).toBe('deepLink');
    expect(sourceFromUrlParams({ entry: 'shortcut' })).toBe('shortcut');
    expect(toNativeVoiceEntryItem({ ...params, source: 'somethingElse' })?.source).toBe('deepLink');
    expect(toNativeVoiceEntryItem({ source: 'iosAppIntent', action: 'openToday' })).toEqual({
      source: 'iosAppIntent',
      payload: { action: 'openToday' },
    });
  });
});

describe('native payload contract', () => {
  const swift = fs.readFileSync(
    path.join(ROOT, 'native/ios/system-voice-entry/SystemVoiceEntryIntents.swift'),
    'utf8',
  );
  const moduleSwift = fs.readFileSync(
    path.join(ROOT, 'modules/system-voice-entry/ios/SystemVoiceEntryModule.swift'),
    'utf8',
  );
  const shortcutsXml = fs.readFileSync(
    path.join(ROOT, 'native/android/system-voice-entry/shortcuts.xml'),
    'utf8',
  );

  it('uses only TypeScript schema keys and actions in the Swift App Intents', () => {
    const dictionaryKeys = [...swift.matchAll(/"([A-Za-z]+)":\s/g)].map((match) => match[1]);
    const actions = [...swift.matchAll(/action:\s*"([A-Za-z]+)"/g)].map((match) => match[1]);
    const allowed = [...VOICE_ENTRY_PAYLOAD_KEYS, 'source'];

    expect(dictionaryKeys.length).toBeGreaterThan(8);
    expect(dictionaryKeys.filter((key) => !allowed.includes(key as never))).toEqual([]);
    expect(new Set(actions)).toEqual(
      new Set([
        'addListItem',
        'captureFutureTask',
        'createCalendarEvent',
        'openToday',
        'openVoiceCapture',
      ]),
    );
    expect(
      actions.every((action) => (VOICE_ENTRY_ACTIONS as readonly string[]).includes(action ?? '')),
    ).toBe(true);
    expect(swift).toContain('static let payloadVersion = "1"');
    expect(swift).toContain('static let source = "iosAppIntent"');
    expect(swift).not.toMatch(/Speech|AVAudio|microphone|parse/i);
  });

  it('shares the queue key and notification name between App Intents and the Expo module', () => {
    const key = /defaultsKey = "([^"]+)"/;
    const notification = /Notification\.Name\("([^"]+)"\)/;

    expect(swift.match(key)?.[1]).toBe(moduleSwift.match(key)?.[1]);
    expect(swift.match(notification)?.[1]).toBe(moduleSwift.match(notification)?.[1]);
  });

  it('builds Android launcher shortcut links that pass the TypeScript validator', () => {
    const links = [...shortcutsXml.matchAll(/android:data="([^"]+)"/g)].map((match) =>
      (match[1] ?? '').replaceAll('&amp;', '&').replace('__SCHEME__', 'planner'),
    );

    expect(links).toHaveLength(4);
    for (const link of links) {
      const url = new URL(link);
      const params = Object.fromEntries(url.searchParams.entries());
      expect(url.host).toBe('voice-entry');
      expect(
        Object.keys(params).every((param) => param in VOICE_ENTRY_URL_PARAMS || param === 'entry'),
      ).toBe(true);
      expect(
        parseVoiceEntryPayload(payloadFromUrlParams(params), {
          source: sourceFromUrlParams(params),
          now: NOW,
          generateId: () => 'generated-id-2',
        }).ok,
      ).toBe(true);
    }
  });
});
