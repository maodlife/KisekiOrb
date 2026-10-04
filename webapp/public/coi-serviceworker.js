// GitHub Pages cannot configure HTTP headers. Intercept same-origin responses
// so the document, classic Worker and Z3 pthreads can use SharedArrayBuffer.
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', event => {
    if (new URL(event.request.url).origin !== self.location.origin) return;
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;
    event.respondWith(fetch(event.request).then(response => {
      if (response.status === 0) return response;
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }));
  });
} else if (window.isSecureContext && 'serviceWorker' in navigator) {
  const scriptUrl = document.currentScript.src;
  const reloadKey = `orbment.isolation-reload:${new URL('.', scriptUrl).pathname}`;
  const reloadOnce = () => {
    if (window.crossOriginIsolated || !navigator.serviceWorker.controller) return;
    if (sessionStorage.getItem(reloadKey)) return;
    sessionStorage.setItem(reloadKey, 'true');
    window.location.reload();
  };
  if (window.crossOriginIsolated) sessionStorage.removeItem(reloadKey);
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
  navigator.serviceWorker.register(scriptUrl).then(reloadOnce).catch(error => {
    console.error('Unable to enable browser isolation for Z3:', error);
  });
}
