/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  let payload: { title?: string; body?: string; icon?: string; badge?: string; data?: Record<string, string> } = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { title: 'New notification', body: 'You have a new update.' };
  }

  const title = typeof payload.title === 'string' ? payload.title : 'FitMask';
  const options: NotificationOptions = {
    body: typeof payload.body === 'string' ? payload.body : 'You have a new update.',
    icon: typeof payload.icon === 'string' ? payload.icon : '/logo.png',
    badge: typeof payload.badge === 'string' ? payload.badge : '/logo.png',
    data: { url: typeof payload.data?.url === 'string' ? payload.data.url : '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matchingWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (matchingWindow) {
      await matchingWindow.focus();
      matchingWindow.postMessage({ type: 'notification-click', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
