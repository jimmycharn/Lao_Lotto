// Tombstone service worker.
// A previous deploy registered a PWA service worker on user devices.
// Users who cached the old SW will fetch this file on next visit; it
// unregisters itself and clears all caches so the app loads fresh again.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      } catch (e) { /* noop */ }
      try {
        await self.registration.unregister()
      } catch (e) { /* noop */ }
      try {
        const clientsList = await self.clients.matchAll({ type: 'window' })
        clientsList.forEach((client) => {
          try { client.navigate(client.url) } catch (e) { /* noop */ }
        })
      } catch (e) { /* noop */ }
    })()
  )
})

// Pass through all fetches directly to the network.
self.addEventListener('fetch', () => { /* no-op, let browser handle */ })
