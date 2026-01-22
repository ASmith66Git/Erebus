import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getApiUrl } from '@/utils/apiConfig';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationState {
  token: string | null;
  permission: 'granted' | 'denied' | 'undetermined';
}

class NotificationService {
  private token: string | null = null;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;

  async initialize(): Promise<PushNotificationState> {
    console.log('[NotificationService] Initializing on platform:', Platform.OS);
    
    if (Platform.OS === 'web') {
      console.log('[NotificationService] Web platform - skipping push notifications');
      return { token: null, permission: 'undetermined' };
    }

    if (!Device.isDevice) {
      console.log('[NotificationService] Not a physical device - push notifications unavailable');
      return { token: null, permission: 'undetermined' };
    }

    console.log('[NotificationService] Physical device detected, checking permissions...');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[NotificationService] Existing permission status:', existingStatus);
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      console.log('[NotificationService] Requesting notification permissions...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[NotificationService] Permission request result:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('[NotificationService] Permission denied');
      return { token: null, permission: 'denied' };
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      console.log('[NotificationService] Project ID:', projectId);
      
      if (!projectId) {
        console.error('[NotificationService] No project ID found in app config');
        return { token: null, permission: 'granted' };
      }

      console.log('[NotificationService] Getting Expo push token...');
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      this.token = tokenData.data;
      console.log('[NotificationService] Push token obtained:', this.token);

      if (Platform.OS === 'android') {
        console.log('[NotificationService] Setting up Android notification channels...');
        await this.setupAndroidChannel();
      }

      return { token: this.token, permission: 'granted' };
    } catch (error) {
      console.error('[NotificationService] Error getting push token:', error);
      return { token: null, permission: 'granted' };
    }
  }

  private async setupAndroidChannel(): Promise<void> {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D22F00',
    });

    await Notifications.setNotificationChannelAsync('dive-reminders', {
      name: 'Dive Reminders',
      description: 'Reminders about upcoming dives',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D22F00',
    });

    await Notifications.setNotificationChannelAsync('sync-updates', {
      name: 'Sync Updates',
      description: 'Notifications about dive log sync status',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  async registerTokenWithServer(authToken: string): Promise<boolean> {
    console.log('[NotificationService] Attempting to register token with server...');
    
    if (!this.token) {
      console.log('[NotificationService] No push token available to register');
      return false;
    }

    const apiUrl = getApiUrl();
    console.log('[NotificationService] API URL:', apiUrl);
    console.log('[NotificationService] Token to register:', this.token);
    console.log('[NotificationService] Platform:', Platform.OS);
    console.log('[NotificationService] Device name:', Device.deviceName);

    try {
      const response = await fetch(`${apiUrl}/api/push-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          token: this.token,
          platform: Platform.OS,
          deviceName: Device.deviceName || 'Unknown Device',
        }),
      });

      const responseText = await response.text();
      console.log('[NotificationService] Server response status:', response.status);
      console.log('[NotificationService] Server response:', responseText);

      if (!response.ok) {
        console.error('[NotificationService] Failed to register push token:', response.status, responseText);
        return false;
      }

      console.log('[NotificationService] Push token registered successfully with server');
      return true;
    } catch (error) {
      console.error('[NotificationService] Error registering push token:', error);
      return false;
    }
  }

  async unregisterTokenFromServer(authToken: string): Promise<boolean> {
    if (!this.token) {
      return true;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/push-tokens`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token: this.token }),
      });

      return response.ok;
    } catch (error) {
      console.error('Error unregistering push token:', error);
      return false;
    }
  }

  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): void {
    this.notificationListener = Notifications.addNotificationReceivedListener(callback);
  }

  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): void {
    this.responseListener = Notifications.addNotificationResponseReceivedListener(callback);
  }

  removeListeners(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }

  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string> {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: trigger || null,
    });
  }

  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  getToken(): string | null {
    return this.token;
  }
}

export const notificationService = new NotificationService();
export default notificationService;
