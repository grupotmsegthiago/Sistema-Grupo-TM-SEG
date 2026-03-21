const CACHE_NAME = 'tmseg-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then(names => Promise.all(
        names.map(n => caches.delete(n))
      ))
    ])
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let data = { title: 'TMSEG', body: '', tag: 'tmseg', icon: '/favicon.png' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/favicon.png',
      badge: '/favicon.png',
      tag: data.tag || 'tmseg',
      vibrate: [200, 100, 200],
      renotify: true,
      data: data
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        clientList[0].focus();
        return;
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/favicon.png',
        badge: '/favicon.png',
        tag: tag || 'tmseg-notification',
        vibrate: [200, 100, 200],
        renotify: true
      })
    );
  }
});
