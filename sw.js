const CACHE_NAME = 'nexus-cache-v1';

// Lista rigorosa de recursos CDN detectados no seu HTML.
// O Service Worker irá pré-carregar tudo isso para garantir funcionamento offline.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/vue@3/dist/vue.global.js',
  'https://unpkg.com/dexie/dist/dexie.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://docs.opencv.org/4.8.0/opencv.js'
];

// Instalação: Cacheamento agressivo dos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets');
        // Usa addAll, mas trata falhas individuais para não quebrar toda a instalação
        // se um CDN específico estiver fora do ar.
        return Promise.all(
          PRECACHE_URLS.map(url => {
            return cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err));
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Ativação: Limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de Requisições: Estratégia Híbrida
self.addEventListener('fetch', (event) => {
  // Ignora requisições que não sejam GET ou esquemas chrome-extension, etc.
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // ESTRATÉGIA 1: Stale-While-Revalidate para o próprio App (index.html, JS locais)
  // Isso garante que o usuário veja a versão em cache rápido, mas atualiza em background.
  if (url.origin === location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // ESTRATÉGIA 2: Cache First para CDNs externos
  // Bibliotecas como Vue e Tailwind raramente mudam a URL exata. Priorizamos velocidade/offline.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Verifica se a resposta é válida antes de cachear
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback offline (opcional: retornar uma imagem placeholder se for imagem)
      });
    })
  );
});
