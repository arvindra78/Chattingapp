import axios from 'axios';
import { buildApiUrl } from '../runtimeConfig';

export type NotificationProvider = 'native-android' | 'web-push' | 'unsupported';
export type NotificationState = 'enabled' | 'disabled' | 'denied' | 'unsupported';

declare global {
  interface Window {
    AndroidNotifications?: {
      isAvailable?: () => boolean;
      requestPermission?: () => unknown | Promise<unknown>;
      getPermissionStatus?: () => unknown | Promise<unknown>;
    };
  }
}

const isBrowserPushSupported = () => (
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window
);

const isNativeAndroidAvailable = () => {
  if (typeof window === 'undefined') return false;

  try {
    return typeof window.AndroidNotifications?.isAvailable === 'function' &&
      window.AndroidNotifications.isAvailable() === true;
  } catch {
    return false;
  }
};

export const getNotificationProvider = (): NotificationProvider => {
  const nativeAndroidAvailable = isNativeAndroidAvailable();
  const browserPushSupported = isBrowserPushSupported();

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    console.debug('[Notifications] Android bridge:', typeof window.AndroidNotifications);
    console.debug('[Notifications] Native available:', nativeAndroidAvailable);
    console.debug('[Notifications] Browser Push:', {
      notification: 'Notification' in window,
      pushManager: 'PushManager' in window,
      serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    });
  }

  const provider: NotificationProvider = nativeAndroidAvailable
    ? 'native-android'
    : browserPushSupported
      ? 'web-push'
      : 'unsupported';

  if (import.meta.env.DEV) console.debug('[Notifications] Selected provider:', provider);
  return provider;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
};

const headers = (token: string) => ({ 'x-auth-token': token });

const getNativeNotificationState = async (): Promise<NotificationState> => {
  let status: unknown;
  try {
    status = await Promise.resolve(window.AndroidNotifications?.getPermissionStatus?.());
  } catch {
    // The bridge is available, so retain the native provider while its status settles.
    return 'disabled';
  }
  const normalizedStatus = String(status ?? '').toLowerCase();

  if (status === true || ['granted', 'authorized', 'enabled'].includes(normalizedStatus)) return 'enabled';
  if (['denied', 'blocked'].includes(normalizedStatus)) return 'denied';
  return 'disabled';
};

export const getNotificationState = async (provider = getNotificationProvider()): Promise<NotificationState> => {
  if (provider === 'unsupported') return 'unsupported';
  if (provider === 'native-android') return getNativeNotificationState();

  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'disabled';
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? 'enabled' : 'disabled';
};

export const enableNotifications = async (token: string, provider = getNotificationProvider()) => {
  if (provider === 'unsupported') throw new Error('Push notifications are not supported by this browser or WebView.');
  if (provider === 'native-android') {
    const bridge = window.AndroidNotifications;
    if (!bridge?.requestPermission || !bridge.getPermissionStatus) {
      throw new Error('Native Android notifications are unavailable.');
    }

    await Promise.resolve(bridge.requestPermission());
    const state = await getNativeNotificationState();
    if (state === 'denied') {
      throw new Error('Notifications are blocked. Enable them in Android settings and try again.');
    }
    if (state !== 'enabled') throw new Error('Notification permission was not granted.');
    return;
  }

  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked. Enable them in your browser settings and try again.');
  }
  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const keyResponse = await axios.get(buildApiUrl('/api/notifications/vapid-public-key'), { headers: headers(token) });
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyResponse.data.publicKey)
  });
  await axios.post(buildApiUrl('/api/notifications/subscribe'), { subscription: subscription.toJSON() }, { headers: headers(token) });
  return subscription;
};

export const disableNotifications = async (token: string, provider = getNotificationProvider()): Promise<NotificationState> => {
  if (provider === 'unsupported') return 'unsupported';
  if (provider === 'native-android') return getNativeNotificationState();

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return 'disabled';
  await axios.delete(buildApiUrl('/api/notifications/subscribe'), {
    headers: headers(token),
    data: { subscription: subscription.toJSON() }
  });
  await subscription.unsubscribe();
  return 'disabled';
};

export const sendNotificationTest = (token: string) => axios.post(
  buildApiUrl('/api/notifications/test'),
  {},
  { headers: headers(token) }
);

export const onNotificationClick = (callback: (url: string) => void) => {
  if (!('serviceWorker' in navigator)) return () => undefined;
  const handler = (event: MessageEvent<{ type?: string; url?: string }>) => {
    if (event.data?.type === 'notification-click' && event.data.url) callback(event.data.url);
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
};
