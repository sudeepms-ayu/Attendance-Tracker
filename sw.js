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

// ---- Morning messages: Uday Odia classes + Mission Jeet test countdown ----
// The app saves the dated list of messages; from 6 am on the day itself the
// worker shows each one once (same tag as the in-app message, so the phone
// never ends up with two copies).
async function showScheduledMessages(){
  const cache = await caches.open(TASK_CACHE);
  const snap = await readJson(cache, './__sched-events.json');
  if(!snap || !Array.isArray(snap.events) || !snap.events.length) return;
  const now = new Date();
  if(now.getHours() < 6) return;
  const today = localDateKey(now);
  let last = await readJson(cache, './__sched-last.json');
  if(!last || last.day !== today || !Array.isArray(last.tags)) last = { day: today, tags: [] };
  let changed = false;
  for(const ev of snap.events){
    if(!ev || ev.day !== today || last.tags.indexOf(ev.tag) !== -1) continue;
    const opts = { body: ev.body, tag: ev.tag };
    if(snap.icon) opts.icon = snap.icon;
    if(snap.badge) opts.badge = snap.badge;
    await self.registration.showNotification(ev.title, opts);
    last.tags.push(ev.tag); changed = true;
  }
  if(changed) await cache.put('./__sched-last.json', new Response(JSON.stringify(last), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', e => {
  if(e.tag === 'task-pending-daily') e.waitUntil(showPendingTaskReminder());
  if(e.tag === 'sched-daily') e.waitUntil(showScheduledMessages());
});
// Also lets the app ask the worker to check right now.
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'task-reminder-check') e.waitUntil(showPendingTaskReminder());
  if(e.data && e.data.type === 'sched-check') e.waitUntil(showScheduledMessages());
});


// ---- Alarm & timer notifications ----
// The app sends the upcoming alarm / timer moments ("clock-sync"). While this
// worker is awake it waits for each moment and shows the notification at that
// exact time (vibrating, stays until tapped). The app re-sends every few
// seconds, which keeps re-arming the worker. If the app itself is on screen it
// rings by itself, so nothing is shown twice.
const CLOCK_URL = './__clock.json', CLOCK_FIRED = './__clock-fired.json';
let clockRun = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jsonRes = o => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });

async function armClock(){
  const run = ++clockRun, cache = await caches.open(TASK_CACHE), stop = Date.now() + 270000;
  while(Date.now() < stop && run === clockRun){
    const snap = await readJson(cache, CLOCK_URL);
    let fired = (await readJson(cache, CLOCK_FIRED)) || {};
    const evs = ((snap && snap.events) || []).filter(e => e && !fired[e.id]);
    if(!evs.length) return;
    const wait = Math.min.apply(null, evs.map(e => e.at)) - Date.now();
    if(wait > 0){ await sleep(Math.min(wait, 15000)); continue; }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const onScreen = wins.some(c => c.visibilityState === 'visible');
    for(const e of evs){
      if(e.at > Date.now()) continue;
      fired[e.id] = Date.now();
      if(onScreen || Date.now() - e.at > 30 * 60000) continue; // app rings itself / too late to matter
      await self.registration.showNotification(e.title, {
        body: e.body, tag: 'clk-' + e.id, requireInteraction: true, renotify: false,
        vibrate: [400, 200, 400, 200, 400, 200, 400], data: { clock: true }
      });
    }
    Object.keys(fired).forEach(k => { if(Date.now() - fired[k] > 2 * 86400000) delete fired[k]; });
    await cache.put(CLOCK_FIRED, jsonRes(fired));
  }
}
self.addEventListener('message', e => {
  if(!e.data || e.data.type !== 'clock-sync') return;
  e.waitUntil((async () => {
    const cache = await caches.open(TASK_CACHE);
    await cache.put(CLOCK_URL, jsonRes({ events: e.data.events || [] }));
    await armClock();
  })());
});
