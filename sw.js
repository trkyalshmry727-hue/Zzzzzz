// RPMX offline worker: keeps the page and every game file on the phone so the game opens without internet
const SHELL = 'rpmx-shell-v1', PACKS = 'rpmx-packs', FONTS = 'rpmx-fonts';
const HOME = new URL('./', self.registration.scope).href;
const MAN = { name: 'RPMX', short_name: 'RPMX', start_url: './', scope: './', display: 'standalone', orientation: 'landscape', background_color: '#09090b', theme_color: '#09090b', lang: 'ar', dir: 'rtl' };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.add(new Request(HOME, { cache: 'reload' }))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('rpmx-shell') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// the page: try the internet for a few seconds (to get updates), otherwise open the saved copy at once
function page(e) {
  const net = fetch(e.request.url.split('#')[0], { cache: 'no-store' }).then(async r => {
    if (r && r.ok) { const c = await caches.open(SHELL); await c.put(HOME, r.clone()); }
    return r;
  });
  e.waitUntil(net.catch(() => {}));
  const saved = () => caches.open(SHELL).then(c => c.match(HOME));
  return new Promise(res => {
    let done = false; const give = r => { if (!done && r) { done = true; res(r); } };
    const t = setTimeout(() => saved().then(give), 3000);
    net.then(r => { if (r && r.ok) { clearTimeout(t); give(r); } else saved().then(s => give(s || r)); })
       .catch(() => { clearTimeout(t); saved().then(s => give(s || Response.error())); });
  });
}

// a game file: answer from the phone when it is saved (including partial reads), otherwise from the internet
async function pack(e, u) {
  const c = await caches.open(PACKS), hit = await c.match(u.href);
  if (!hit) return fetch(e.request);
  const rg = e.request.headers.get('range'), m = rg && /bytes=(\d+)-(\d*)/.exec(rg);
  if (!m) return hit;
  const b = await hit.blob(), a = +m[1], z = m[2] ? Math.min(+m[2], b.size - 1) : b.size - 1;
  if (a >= b.size) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + b.size } });
  return new Response(b.slice(a, z + 1), { status: 206, headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes ' + a + '-' + z + '/' + b.size, 'content-length': String(z - a + 1), 'accept-ranges': 'bytes' } });
}

async function font(e) {
  const c = await caches.open(FONTS), hit = await c.match(e.request.url);
  if (hit) return hit;
  // never let a slow or dead connection hold the game: after 2 s go on without the font
  const net = fetch(e.request).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request.url, r.clone()).catch(() => {}); return r; });
  e.waitUntil(net.catch(() => {}));
  const late = new Promise(res => setTimeout(() => res(null), 2000));
  const r = await Promise.race([net.catch(() => null), late]);
  if (r) return r;
  return /fonts\.googleapis\.com/.test(e.request.url) ? new Response('', { headers: { 'content-type': 'text/css' } }) : Response.error();
}

self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (r.mode === 'navigate' || u.href.split('?')[0] === HOME || u.href.split('?')[0] === HOME + 'index.html') return e.respondWith(page(e));
    if (/\.wasm$/.test(u.pathname)) return e.respondWith(pack(e, u));
    if (/\/manifest\.json$/.test(u.pathname)) return e.respondWith(new Response(JSON.stringify(MAN), { headers: { 'content-type': 'application/manifest+json' } }));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return e.respondWith(font(e));
});
