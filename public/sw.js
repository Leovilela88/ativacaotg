// Service worker da /projeta (tablet instalado como app): app, conteudo e midias ficam no disco do aparelho.
// Registrado so em /projeta, com escopo "/projeta" (Peixes, Aves, menu e admin nao sao afetados).
// Emergencia: abrir /projeta?sw=off desregistra, apaga tudo e mantem desligado; /projeta?sw=on religa.
const V = 'v1';
const SHELL = 'projeta-shell-' + V, MEDIA = 'projeta-media-' + V, DATA = 'projeta-data-' + V;
const SHELL_URLS = ['/projeta', '/style.css', '/app.js', '/config.js', '/img/logo.png', '/img/fundo-lite.jpg', '/img/icon-192.png', '/img/icon-512.png', '/manifest/projeta.webmanifest'];
const MEDIA_RE = /\.(mp4|webm|mov|mp3|m4a|ogg|wav|jpe?g|png|webp|gif)$/i;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(SHELL_URLS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.indexOf('projeta-') === 0 && [SHELL, MEDIA, DATA].indexOf(k) < 0).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Chave de cache sem o parametro "_" (usado so para furar cache) e sem query nas paginas.
function key(req) {
  const u = new URL(req.url);
  if (req.mode === 'navigate') return u.origin + u.pathname.replace(/\/$/, '');
  u.searchParams.delete('_');
  return u.href;
}
async function networkFirst(req, name, ms) {
  const cache = await caches.open(name), k = key(req);
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(k, res.clone()); return res; });
  net.catch(() => {});
  const timer = new Promise((r) => setTimeout(() => r(null), ms));
  const fallback = async () => (await cache.match(k)) || (req.mode === 'navigate' ? await cache.match(self.location.origin + '/projeta') : null);
  try {
    const first = await Promise.race([net, timer]);
    if (first) return first;
    return (await fallback()) || (await net);
  } catch (e) {
    const hit = await fallback();
    if (hit) return hit;
    if (new URL(req.url).pathname.indexOf('/api/') === 0) return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    return Response.error();
  }
}

// Midias: do disco quando ja baixadas (com suporte a Range, exigido pelo <video>); senao segue pela rede.
async function mediaFetch(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req.url);
  if (!hit) return fetch(req);
  const range = req.headers.get('range');
  if (!range) return hit;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const blob = await hit.blob(), size = blob.size;
  let start = m && m[1] ? parseInt(m[1], 10) : 0, end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
  if (start >= size || start > end) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  end = Math.min(end, size - 1);
  return new Response(blob.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': hit.headers.get('Content-Type') || blob.type || 'application/octet-stream',
    'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}

// ---------- fila de pontuacoes (IndexedDB) ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('projeta', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('scores', { autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function enqueue(body) {
  const db = await idb();
  await new Promise((res, rej) => { const tx = db.transaction('scores', 'readwrite'); tx.objectStore('scores').add(body); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function flush() {
  const db = await idb();
  const items = await new Promise((res) => {
    const out = [], c = db.transaction('scores', 'readonly').objectStore('scores').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ k: cur.key, v: cur.value }); cur.continue(); } else res(out); };
    c.onerror = () => res(out);
  });
  for (const it of items) {
    try {
      const r = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: it.v });
      if (r.ok || r.status === 400) {                                // enviada (ou invalida: descarta)
        await new Promise((res) => { const tx = db.transaction('scores', 'readwrite'); tx.objectStore('scores').delete(it.k); tx.oncomplete = res; tx.onerror = res; });
      }
    } catch (e) { break; }                                           // ainda sem internet
  }
}
async function postScore(req) {
  const body = await req.clone().text();
  try { return await fetch(req); }
  catch (e) {
    await enqueue(body);
    try { if (self.registration.sync) await self.registration.sync.register('scores'); } catch (e2) {}
    return new Response(JSON.stringify({ queued: true, id: null, rank: null, players: null }), { headers: { 'Content-Type': 'application/json' } });
  }
}
self.addEventListener('sync', (e) => { if (e.tag === 'scores') e.waitUntil(flush()); });

// ---------- download das midias para uso offline ----------
async function say(msg) { (await self.clients.matchAll()).forEach((c) => c.postMessage(msg)); }
// Guarda o conteudo do quiz sozinho: na 1a instalacao a pagina ja buscou os dados ANTES do service worker assumir,
// entao sem isto o app nao abriria offline logo depois da primeira vez.
async function warmData() {
  const cache = await caches.open(DATA);
  for (const u of ['/api/activation?id=projeta']) {
    try { const res = await fetch(u, { cache: 'no-store' }); if (res.ok) await cache.put(new URL(u, self.location.origin).href, res); } catch (e) {}
  }
}
async function precache(urls) {
  await warmData();
  const cache = await caches.open(MEDIA);
  const abs = urls.map((u) => new URL(u, self.location.origin).href), want = new Set(abs);
  let done = 0, failed = 0;
  await say({ type: 'progress', done, failed, total: abs.length });
  for (const u of abs) {
    try {
      if (!(await cache.match(u))) {
        const res = await fetch(u, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error('http ' + res.status);
        await cache.put(u, res);
      }
      done++;
    } catch (e) { failed++; }
    await say({ type: 'progress', done, failed, total: abs.length });
  }
  for (const k of await cache.keys()) if (!want.has(k.url)) await cache.delete(k);   // some o que saiu do quiz
  await say({ type: 'done', done, failed, total: abs.length });
}
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'precache') e.waitUntil(precache(d.urls || []));
  else if (d.type === 'flush') e.waitUntil(flush());
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url), same = url.origin === self.location.origin;
  if (same && req.method === 'POST' && url.pathname === '/api/score') return e.respondWith(postScore(req));
  if (req.method !== 'GET') return;
  if (same && (url.pathname === '/api/activation' || url.pathname === '/api/ranking')) return e.respondWith(networkFirst(req, DATA, 4000));
  if (same && (req.mode === 'navigate' || SHELL_URLS.indexOf(url.pathname) >= 0)) return e.respondWith(networkFirst(req, SHELL, 3500));
  if (!same && /(^|\.)gstatic\.com$|(^|\.)googleapis\.com$/.test(url.hostname)) {   // fonte (Jost)
    return e.respondWith(caches.open(SHELL).then((c) => c.match(req).then((h) => h || fetch(req).then((r) => { c.put(req, r.clone()); return r; }))));
  }
  if (MEDIA_RE.test(url.pathname) && !(same && url.pathname.indexOf('/img/') === 0)) return e.respondWith(mediaFetch(req));
});
