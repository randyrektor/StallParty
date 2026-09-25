import { shellUrlsFrom } from './utils/shellCache';

function resourceUrls(): string[] {
  if (typeof performance === 'undefined') return [];
  return performance.getEntriesByType('resource').map((entry) => entry.name);
}

function sendShell(worker: ServiceWorker | null) {
  if (!worker) return;
  worker.postMessage({
    type: 'cache-shell',
    urls: shellUrlsFrom(resourceUrls(), window.location.origin),
  });
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      sendShell(registration.active);
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'activated') sendShell(installing);
      });
    }).catch(() => {
      // The board still works online when registration is blocked.
    });
  });
}
