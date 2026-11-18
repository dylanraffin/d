// Service worker minimal : il sert seulement à afficher les notifications du navigateur
// (Android exige de passer par lui). Aucun cache, aucune requête interceptée.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Toucher une notification ramène sur l'app, à l'écran indiqué (messages ou appel).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) return open.focus().then((c) => c.navigate?.(target));
    return self.clients.openWindow(target);
  }));
});
