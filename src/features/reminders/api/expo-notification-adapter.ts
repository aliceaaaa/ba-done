import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { UI_STRINGS } from '@/shared/config/ui-strings';

import {
  REMINDER_ACTIONS,
  REMINDER_CATEGORY_ID,
  REMINDER_CHANNEL_ID,
  type NotificationAdapter,
  type NotificationPermission,
  type NotificationResponseInput,
} from '../model/notification-adapter';

const ANDROID_EXACT_ALARM_API_LEVEL = 31;

function toPermission(
  response: Notifications.NotificationPermissionsStatus,
): NotificationPermission {
  const iosStatus = response.ios?.status;
  const iosAllowsDelivery =
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL;
  if (response.granted || iosAllowsDelivery) {
    return { status: 'granted', canAskAgain: response.canAskAgain };
  }
  return {
    status: response.status === 'undetermined' ? 'undetermined' : 'denied',
    canAskAgain: response.canAskAgain,
  };
}

function toResponseInput(response: Notifications.NotificationResponse): NotificationResponseInput {
  const actionIdentifier =
    response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ? REMINDER_ACTIONS.open
      : response.actionIdentifier;
  const { request, date } = response.notification;
  return {
    responseId: `${request.identifier}:${date}:${actionIdentifier}`,
    actionIdentifier,
    data: request.content.data ?? {},
  };
}

export function createExpoNotificationAdapter(): NotificationAdapter {
  return {
    async initialize() {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
          name: 'Task reminders',
          description: 'Reminders for tasks you planned',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      const opensApp = { opensAppToForeground: true };
      await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
        {
          identifier: REMINDER_ACTIONS.done,
          buttonTitle: UI_STRINGS.reminderActions.done,
          options: opensApp,
        },
        {
          identifier: REMINDER_ACTIONS.notTonight,
          buttonTitle: UI_STRINGS.reminderActions.notTonight,
          options: opensApp,
        },
        {
          identifier: REMINDER_ACTIONS.remindLater,
          buttonTitle: UI_STRINGS.reminderActions.remindLater,
          options: opensApp,
        },
        {
          identifier: REMINDER_ACTIONS.changePriority,
          buttonTitle: UI_STRINGS.reminderActions.changePriority,
          options: opensApp,
        },
      ]);
    },

    async getPermission() {
      return toPermission(await Notifications.getPermissionsAsync());
    },

    async requestPermission() {
      return toPermission(
        await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false },
        }),
      );
    },

    schedule(request) {
      return Notifications.scheduleNotificationAsync({
        identifier: request.identifier,
        content: {
          title: request.title,
          body: request.body,
          data: { ...request.data },
          categoryIdentifier: REMINDER_CATEGORY_ID,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: request.fireAt,
          channelId: REMINDER_CHANNEL_ID,
        },
      });
    },

    cancel(identifier) {
      return Notifications.cancelScheduledNotificationAsync(identifier);
    },

    async listScheduled() {
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      return requests.map((request) => ({
        identifier: request.identifier,
        data: request.content.data ?? {},
      }));
    },

    openSettings() {
      return Linking.openSettings();
    },

    getExactAlarmSupport() {
      return Platform.OS === 'android' && Number(Platform.Version) >= ANDROID_EXACT_ALARM_API_LEVEL
        ? 'mayBeDelayed'
        : 'exact';
    },

    addResponseListener(listener) {
      const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
        listener(toResponseInput(response)),
      );
      return () => subscription.remove();
    },

    async getLastResponse() {
      const response = await Notifications.getLastNotificationResponseAsync();
      return response === null ? null : toResponseInput(response);
    },

    clearLastResponse() {
      return Notifications.clearLastNotificationResponseAsync();
    },
  };
}
