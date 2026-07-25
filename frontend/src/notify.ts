import * as Notifications from 'expo-notifications';

/** Local notification for a received 思念 (falls back to in-app banner if denied). */
export async function setupNotifications(): Promise<void> {
  try {
    await Notifications.requestPermissionsAsync();
    Notifications.setNotificationHandler({
      handleNotification: async () =>
        ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }) as any,
    });
  } catch {
    // no-op; UI banner is the fallback
  }
}

export async function showMissYou(fromNickname: string | null, memory: string | null): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${fromNickname ?? 'TA'} 在想你 💍`,
        body: memory ?? '此刻，有人正在想你',
      },
      trigger: null,
    });
  } catch {
    // ignore (e.g. Expo Go push limitations); the in-app banner still shows
  }
}
