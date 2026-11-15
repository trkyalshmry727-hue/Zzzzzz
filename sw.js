// RPMX offline helper: keeps the game page on the phone so it opens without internet.
// (the cars and maps are kept on the phone by the game itself)
const SHELL = 'rpmx-shell-v2', FONTS = 'rpmx-fonts';
const HOME = new URL('./', self.registration.scope).href;
const MAN = { name: 'RPMX', short_name: 'RPMX', start_url: './', scope: './', display: 'standalone', orientation: 'landscape', background_color: '#09090b', theme_color: '#09090b', lang: 'ar', dir: 'rtl' };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.add(new Request(HOME, { cache: 'no-cache' }))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('rpmx-shell') && k !== SHELL) || k === 'rpmx-packs').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// the page: ask the site quickly (only the changes come down); if it is slow or there is no internet, open the saved copy right away
function page(e) {
  let gaveSaved = false;
  const sig = r => r ? [r.headers.get('etag'), r.headers.get('last-modified'), r.headers.get('content-length')].join('|') : '';
  const net = fetch(HOME, { cache: 'no-cache' }).then(async r => {
    if (r && r.ok) {
      const c = await caches.open(SHELL), old = await c.match(HOME), changed = !old || sig(old) !== sig(r);
      await c.put(HOME, r.clone());
      // the player got the older saved copy and a newer game just came down: tell the page so it refreshes itself
      if (gaveSaved && changed) { await c.put(HOME + '?rpmx-new', new Response('1')); (await self.clients.matchAll({ type: 'window' })).forEach(w => w.postMessage({ t: 'rpmx-new' })); }
    }
    return r;
  });
  e.waitUntil(net.catch(() => {}));
  const saved = () => caches.open(SHELL).then(c => c.match(HOME));
  return new Promise(res => {
    let done = false; const give = r => { if (!done && r) { done = true; res(r); } };
    const t = setTimeout(() => saved().then(r => { if (!done && r) gaveSaved = true; give(r); }), 1500);
    net.then(r => { if (r && r.ok) { clearTimeout(t); give(r); } else saved().then(s => give(s || r)); })
       .catch(() => { clearTimeout(t); saved().then(s => give(s || Response.error())); });
  });
}

async function font(e) {
  const c = await caches.open(FONTS), hit = await c.match(e.request.url);
  if (hit) return hit;
  // never let a slow or dead connection hold the game: after 2 s go on without the font
  const net = fetch(e.request).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request.url, r.clone()).catch(() => {}); return r; });
  e.waitUntil(net.catch(() => {}));
  const r = await Promise.race([net.catch(() => null), new Promise(res => setTimeout(() => res(null), 2000))]);
  if (r) return r;
  return /fonts\.googleapis\.com/.test(e.request.url) ? new Response('', { headers: { 'content-type': 'text/css' } }) : Response.error();
}

self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    const bare = u.href.split('?')[0].split('#')[0];
    if (r.mode === 'navigate' || bare === HOME || bare === HOME + 'index.html') return e.respondWith(page(e));
    if (/\/manifest\.json$/.test(u.pathname)) return e.respondWith(new Response(JSON.stringify(MAN), { headers: { 'content-type': 'application/manifest+json' } }));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return e.respondWith(font(e));
});
