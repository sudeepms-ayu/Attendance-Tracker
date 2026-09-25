// Optional helper for index.html: lets Android/Chrome show homework due-date
// notifications. Keep this file in the same folder as index.html.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('periodicsync', (event) => {
  // Best-effort background wake-up (works only on some installed PWAs).
  // Without a server (Push), this is the only offline mechanism.
  if(event && event.tag === 'daily-reminders'){
    event.waitUntil((async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for(const c of clients){
        try{ c.postMessage({ type: 'runDailyChecks' }); }catch(e){}
      }
      // If no client is open, show a minimal prompt.
      if(!clients || clients.length === 0){
        try{
          await self.registration.showNotification('Exam Tracker', {
            body: 'Open the app to see today\'s reminders.',
            tag: 'daily-reminders',
            renotify: false,
            silent: true,
          });
        }catch(e){}
      }
    })());
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for(const c of list){ if('focus' in c) return c.focus(); }
    if(self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
