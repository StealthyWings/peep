// peep service worker: makes the whole app work on a trail with no signal.
//  - app shell: precached on install (index + its hashed JS/CSS)
//  - navigations: network-first, falls back to the cached shell
//  - models: cache-first (they never change)
//  - field guide: stale-while-revalidate (cached, refreshed in the background)
//  - flock API: always network (the flock syncs when you're back online)
//
// Works at the domain root or under a sub-path (e.g. GitHub Pages "/peep/"):
// BASE is wherever this worker was registered.

const BASE = new URL(self.registration.scope).pathname
const SHELL = 'peep-shell-v2'
const MODELS = 'peep-models-v1' // shared with src/lib/offline.ts
const IMAGES = 'peep-images-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      const html = await (await fetch(BASE, { cache: 'no-store' })).text()
      const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1])
      await cache.addAll([BASE, ...['manifest.webmanifest', 'icon.svg', 'icon-192.png'].map((f) => BASE + f), ...assets])
    })(),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  const keep = [SHELL, MODELS, IMAGES]
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request, { ignoreSearch: true })
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request, { ignoreSearch: true })
  const refresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone())
      return res
    })
    .catch(() => hit)
  return hit ?? refresh
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(BASE, res.clone())
    return res
  } catch {
    return (await cache.match(BASE)) ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Wikipedia thumbnails: nice to have offline once seen.
  if (url.hostname === 'upload.wikimedia.org') {
    event.respondWith(cacheFirst(request, IMAGES).catch(() => Response.error()))
    return
  }
  // Other origins (e.g. a flock server on Render) always go to the network.
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return
  const path = url.pathname.slice(BASE.length) // "models/…", "assets/…", ""
  if (path.startsWith('api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
  } else if (path.startsWith('data/')) {
    event.respondWith(staleWhileRevalidate(request, MODELS))
  } else if (/^(models|mediapipe)\//.test(path)) {
    event.respondWith(cacheFirst(request, MODELS))
  } else {
    event.respondWith(cacheFirst(request, SHELL))
  }
})
