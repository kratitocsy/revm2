/* RevM² Service Worker — Offline Support */
const CACHE = 'revm2-v11'; // bumped: was v10 - Wynko rebrand. Clears the old
// purple style.css/shared.js that returning users kept seeing on first open.
// v10 note: responsive fixes in style.css and page CSS should reach
// returning users on their first load.
// v9 note: was v8. Pages are now served at clean
// URLs (vercel.json cleanUrls: /tracker, not /tracker.html - the .html
// forms redirect), so SHELL caches the clean URLs; caching the .html forms
// would store redirects, which browsers refuse to use for navigations.
// Also drops '/index.html', which doesn't exist and made addAll() fail.
const SHELL = [
  '/',
  '/home',
  '/login',
  '/tracker',
  '/groups',
  '/partners',
  '/chat',
  '/privacy',
  '/style.css',
  '/shared.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return; // never cache API calls

  // HTML page loads (actual navigations, e.g. opening blocks.html) always
  // go network-first. This is an actively-developed product shipping new
  // features regularly - cache-first on documents meant "I shipped it but
  // it's not showing up" every single time, for every returning user,
  // until someone thought to manually bump CACHE above. Network-first
  // fixes that permanently: you always get the live page when online, and
  // only fall back to whatever's cached if you're genuinely offline.
  const isNavigation = e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then(cached => cached || new Response(
          '<h1>Offline</h1><p>This page isn\'t cached yet — reconnect and try again.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html' } }
        ))
      )
    );
    return;
  }

  // Static assets (css/js/images) are network-first too, falling back to the
  // cache only when offline. They used to be cache-first, which meant every
  // restyle (e.g. the Wynko rebrand) showed the old look on first open and
  // only appeared after a hard refresh.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || new Response(
        '<h1>Offline</h1><p>This page isn\'t cached yet — reconnect and try again.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html' } }
      ))
    )
  );
});
