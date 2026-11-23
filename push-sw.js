// Push reminders for Trofo, loaded by the service worker. The server only says which
// reminder is due; the words come from today's snapshot on this phone, so they match
// what's actually been eaten. Encouraging, never guilt.
/* global self, clients, indexedDB */
const SLOT_STARTS = { morning: 7 * 60, lunch: 12 * 60, afternoon: 15 * 60, dinner: 18 * 60 + 30 };

function readSnapshot() {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('trofo', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        try {
          const get = req.result.transaction('kv').objectStore('kv').get('today');
          get.onsuccess = () => resolve(get.result || null);
          get.onerror = () => resolve(null);
        } catch { resolve(null); }
      };
    } catch { resolve(null); }
  });
}

function localKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function message(slot, snap) {
  const today = localKey();
  const fresh = !!snap && snap.date === today;
  const yesterday = localKey(new Date(Date.now() - 86400000));
  const target = snap?.target || 100, per = snap?.perMeal || 25;
  const protein = fresh ? snap.protein : 0;
  const left = Math.max(0, Math.round(target - protein));
  const hit = fresh && protein >= target;
  const streak = fresh ? snap.streak : (snap && snap.date === yesterday && snap.todayHit ? snap.streak : 0);
  const logged = new Set(fresh ? snap.meals : []);
  const idea = snap?.idea ? ` ${snap.idea} would do it.` : '';
  if (slot === 'test') return { title: 'Reminders are on', body: 'Trofo will nudge you at meal times. Tap to open.' };
  if (hit && slot !== 'streak') return { title: `Target hit: ${Math.round(protein)} g`, body: streak > 1 ? `${streak}-day streak. Anything else today is a bonus.` : 'Anything else today is a bonus.' };
  switch (slot) {
    case 'morning':
      return logged.has('morning')
        ? { title: `Nice start: ${Math.round(protein)} g`, body: `${left} g to go today. Keep the plates coming.` }
        : { title: 'Breakfast: load the first plate', body: `About ${per} g puts you on pace. One photo and it's logged.` };
    case 'lunch':
      return logged.has('lunch')
        ? { title: `${left} g to go`, body: 'Lunch is in. An after-school snack keeps you on pace.' }
        : { title: 'Lunch: scan your plate', body: `${left} g to go today. One tap, one photo.` };
    case 'afternoon':
      return { title: `${left} g to go`, body: 'After school is the easy win: milk or a YoPRO is 9 to 16 g.' };
    case 'dinner':
      return { title: 'Dinner: the big plate', body: `${left} g left for today.${idea}` };
    case 'streak':
      if (hit) return { title: `Locked in: ${streak}-day streak`, body: 'Target hit today. Same again tomorrow.' };
      return streak > 0
        ? { title: `${left} g to make it ${streak + 1} days`, body: `You've got till midnight.${idea}` }
        : { title: `${left} g to go today`, body: `One more plate and you start a streak.${idea}` };
    default:
      return { title: 'Trofo', body: `${left} g to go today.` };
  }
}

function mealsDue(snap) {
  const fresh = snap && snap.date === localKey();
  if (fresh && snap.protein >= snap.target) return 0;
  const logged = fresh ? snap.meals : [];
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  return Object.entries(SLOT_STARTS).filter(([slot, start]) => m >= start && !logged.includes(slot)).length;
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* plain push */ }
  event.waitUntil((async () => {
    const snap = await readSnapshot();
    const slot = data.slot || 'test';
    const { title, body } = message(slot, snap);
    await self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', tag: `trofo-${slot}`, data: { url: new URL('./', self.registration.scope).href } });
    try {
      const n = mealsDue(snap);
      if (self.navigator.setAppBadge) n > 0 ? await self.navigator.setAppBadge(n) : await self.navigator.clearAppBadge();
    } catch { /* badges are a nice extra */ }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || new URL('./', self.registration.scope).href;
  event.waitUntil((async () => {
    const open = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) if ('focus' in c) return c.focus();
    return clients.openWindow(url);
  })());
});
