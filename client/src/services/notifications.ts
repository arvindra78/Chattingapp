import axios from 'axios';
import { buildApiUrl } from '../runtimeConfig';

export type NotificationState = 'enabled' | 'disabled' | 'denied' | 'unsupported';

declare global {
  interface Window {
    AndroidNotifications?: { isSupported?: () => boolean };
  }
}

const isBrowserPushSupported = () => (
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window
);

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
};

const headers = (token: string) => ({ 'x-auth-token': token });

export const getNotificationState = async (): Promise<NotificationState> => {
  if (!isBrowserPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'disabled';
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? 'enabled' : 'disabled';
};

export const enableNotifications = async (token: string) => {
  if (!isBrowserPushSupported()) throw new Error('Push notifications are not supported by this browser or WebView.');
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

export const disableNotifications = async (token: string) => {
  if (!isBrowserPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await axios.delete(buildApiUrl('/api/notifications/subscribe'), {
    headers: headers(token),
    data: { subscription: subscription.toJSON() }
  });
  await subscription.unsubscribe();
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
