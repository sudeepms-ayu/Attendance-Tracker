// Helper for index.html: lets Android/Chrome show notifications
// (homework, exams, roll call and pending study tasks).
// Keep this file in the same folder as index.html.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for(const c of list){ if('focus' in c) return c.focus(); }
    if(self.clients.openWindow) return self.clients.openWindow('./');
  }));
});

// ---- Pending study-task reminder (works even when the app is closed) ----
// The app saves a small snapshot of your unfinished tasks here; the browser
// then wakes this worker about once a day ("periodic background sync",
// Chrome on Android, installed app) and it shows the reminder if tasks
// are still pending and today's reminder hasn't been shown yet.
const TASK_CACHE = 'cbsh-task-reminder-v1';

function localDateKey(d){
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
async function readJson(cache, url){
  try{ const r = await cache.match(url); return r ? await r.json() : null; }catch(e){ return null; }
}

async function showPendingTaskReminder(){
  const cache = await caches.open(TASK_CACHE);
  const snap = await readJson(cache, './__task-pending.json');
  if(!snap || !Array.isArray(snap.items)) return;
  const today = localDateKey(new Date());
  const pending = snap.items.filter(t => t && t.date <= today);
  if(!pending.length) return;
  const last = await readJson(cache, './__task-last.json');
  if(last && last.day === today) return;

  const lines = pending.slice(0, 6).map(t => (t.date < today ? 'Overdue \u2014 ' : 'Today \u2014 ') + t.subject + ': ' + t.title);
  if(pending.length > 6) lines.push('+' + (pending.length - 6) + ' more');
  const title = pending.length === 1 ? 'Task pending' : pending.length + ' tasks pending';
  const opts = { body: lines.join('\n'), tag: 'task-daily-' + today };
  if(snap.icon) opts.icon = snap.icon;
  if(snap.badge) opts.badge = snap.badge;
  if(snap.image) opts.image = snap.image;
  await self.registration.showNotification(title, opts);
  await cache.put('./__task-last.json', new Response(JSON.stringify({ day: today }), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', e => {
  if(e.tag === 'task-pending-daily') e.waitUntil(showPendingTaskReminder());
});
// Also lets the app ask the worker to check right now.
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'task-reminder-check') e.waitUntil(showPendingTaskReminder());
});
