// CR041 — Web Share Target handler. Loaded into the generated service worker
// via workbox.importScripts (vite.config.js). The SW has no access token (it
// lives in page memory), so it only parks the shared payload in Cache Storage
// and hands off to /share, where the page uploads it with the user's session.
//
// Cache layout ('share-target'):
//   /share-pending/<key>/meta     JSON { title, text, url, files: [{ name, type }], createdAt }
//   /share-pending/<key>/file/<n> the n-th shared file's bytes

const SHARE_CACHE = 'share-target';
// Any site can POST a form here, not just the OS share sheet — so keep raster
// images only (an SVG would be served inline from our origin = stored XSS).
const SHARE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;
  event.respondWith(handleShare(event.request));
});

async function handleShare(request) {
  const key = self.crypto.randomUUID();
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    const files = form.getAll('files')
      .filter((f) => f && typeof f !== 'string' && f.size > 0 && SHARE_TYPES.includes(f.type));
    const str = (v) => (typeof v === 'string' ? v : '');
    const meta = {
      title: str(form.get('title')),
      text: str(form.get('text')),
      url: str(form.get('url')),
      files: files.map((f) => ({ name: f.name || 'shared-image', type: f.type })),
      createdAt: new Date().toISOString()
    };
    for (let i = 0; i < files.length; i++) {
      await cache.put(`/share-pending/${key}/file/${i}`, new Response(files[i], {
        headers: { 'Content-Type': meta.files[i].type }
      }));
    }
    await cache.put(`/share-pending/${key}/meta`, new Response(JSON.stringify(meta), {
      headers: { 'Content-Type': 'application/json' }
    }));
    return Response.redirect(`/share?id=${key}`, 303);
  } catch (err) {
    // Drop any file entries already written (quota etc.) — without meta they'd be invisible.
    try {
      const cache = await caches.open(SHARE_CACHE);
      for (const req of await cache.keys()) {
        if (new URL(req.url).pathname.startsWith(`/share-pending/${key}/`)) await cache.delete(req);
      }
    } catch { /* nothing more to do */ }
    return Response.redirect('/share?error=1', 303);
  }
}
