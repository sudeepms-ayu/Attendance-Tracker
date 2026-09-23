// Optional helper for index.html: lets Android/Chrome show homework due-date
// notifications. Keep this file in the same folder as index.html.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for(const c of list){ if('focus' in c) return c.focus(); }
    if(self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
