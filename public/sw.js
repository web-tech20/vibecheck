const CACHE = 'vibecheck-v2';

self.addEventListener('install', e => {
  self.skipWaiting(); // Force le nouveau SW à s'activer immédiatement
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => caches.delete(key)));
    })
  );
});

self.addEventListener('fetch', e => {
  // Network First strategy (Toujours chercher la version la plus récente)
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Optionnel : on pourrait mettre en cache la nouvelle réponse ici
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
