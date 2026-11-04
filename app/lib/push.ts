import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { api } from './api';

const RESPONSE_TASK = 'notification-response';
const CHANNEL_ID = 'contests';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

TaskManager.defineTask<Notifications.NotificationTaskPayload>(RESPONSE_TASK, async ({ data }) => {
  if ('actionIdentifier' in data) await handleRsvpAction(data);
});
Notifications.registerTaskAsync(RESPONSE_TASK);

export function isRsvpAction(response: Notifications.NotificationResponse): boolean {
  return response.actionIdentifier === 'yes' || response.actionIdentifier === 'no';
}

export async function handleRsvpAction(response: Notifications.NotificationResponse): Promise<void> {
  if (!isRsvpAction(response)) return;
  const contestId = response.notification.request.content.data?.contestId;
  const text = response.userText?.trim();
  await Notifications.dismissNotificationAsync(response.notification.request.identifier);

  if (response.actionIdentifier === 'yes') {
    await api(`/contests/${contestId}/rsvp`, 'POST', { going: true });
  } else if (text) {
    await api(`/contests/${contestId}/rsvp`, 'POST', { going: false, reasonType: 'other', reasonText: text });
  } else {
    await Notifications.scheduleNotificationAsync({
      content: { body: 'Tap to give a reason', data: { contestId, screen: 'reason', rsvp: true } },
      trigger: { channelId: CHANNEL_ID },
    });
  }
}

export async function setupNotifications(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Contests',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationCategoryAsync('rsvp', [
    { identifier: 'yes', buttonTitle: 'Yes', options: { opensAppToForeground: false } },
    {
      identifier: 'no',
      buttonTitle: 'No',
      textInput: { submitButtonTitle: 'Send', placeholder: 'Why not?' },
      options: { opensAppToForeground: false },
    },
  ]);
}

export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice) return;
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/me/push-token', 'POST', { token, kind: 'expo' });
}
