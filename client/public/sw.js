// O servidor injeta uma linha "// build: <timestamp>" no topo deste arquivo
// a cada requisição. Isso garante que todo deploy muda os bytes do sw.js,
// forçando o navegador a baixar a versão nova e disparar o ciclo de update.
const CACHE_NAME = 'tmseg-runtime';

self.addEventListener('install', (event) => {
  // Apaga TODO cache anterior antes de ativar a nova versão.
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
  );
  // Não auto-ativa — espera o app pedir via postMessage('SKIP_WAITING')
  // para podermos sincronizar o reload da página.
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

// Estratégia: SEM cache. Tudo passa direto pela rede para garantir que o
// usuário sempre vê a versão mais recente. O SW existe apenas para receber
// push notifications e para o ciclo de update detectar nova versão.
self.addEventListener('fetch', (event) => {
  // Não interfere em requests não-GET, APIs, supabase ou recursos externos.
  if (event.request.method !== 'GET') return;
  // Network-only, sem cache nenhum.
  event.respondWith(fetch(event.request).catch(() => Response.error()));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
