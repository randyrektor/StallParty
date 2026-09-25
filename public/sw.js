const SHELL = 'stallparty-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache-shell' || !Array.isArray(data.urls)) return;
  event.waitUntil(cacheShell(data.urls));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/watch-ws' || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  if (url.pathname.startsWith('/assets/') || isStaticFile(url.pathname)) {
    event.respondWith(cacheFirstAsset(request));
  }
});

function isStaticFile(pathname) {
  return /\.(?:js|css|png|svg|webp|ico|json|txt|xml|woff2?)$/.test(pathname);
}

function isHtml(response) {
  const type = response.headers.get('content-type') || '';
  return type.includes('text/html');
}

async function cacheShell(urls) {
  const cache = await caches.open(SHELL);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok && !isHtml(response)) await cache.put(url, response);
        if (response.ok && isHtml(response) && new URL(url).pathname === '/') {
          await cache.put('/', response);
        }
      } catch {
        // A dead connection can skip a file. The next online load fills it in.
      }
    })
  );
}

async function networkFirstDocument(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match('/')) || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && !isHtml(response)) await cache.put(request, response.clone());
  return response;
}
