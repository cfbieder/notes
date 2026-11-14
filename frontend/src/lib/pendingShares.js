// CR041 — read/delete shares parked by public/share-target-sw.js.
const SHARE_CACHE = 'share-target';
const META_RE = /\/share-pending\/([^/]+)\/meta$/;
// Same allow-list as the SW: raster images only (no SVG — see share-target-sw.js).
export const SHARE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function hasCaches() {
  return typeof caches !== 'undefined';
}

// Keys of every pending share, oldest first.
export async function listPendingShares() {
  if (!hasCaches()) return [];
  const cache = await caches.open(SHARE_CACHE);
  const out = [];
  for (const req of await cache.keys()) {
    const m = new URL(req.url).pathname.match(META_RE);
    if (!m) continue;
    try {
      const meta = await (await cache.match(req)).json();
      out.push({ key: m[1], createdAt: meta.createdAt || '' });
    } catch { /* one unreadable entry must not hide the rest */ }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// { title, text, url, files: [File], orphan } or null if the key is unknown.
// `orphan` = { noteId, attachmentIds } left by a Save that failed mid-way and
// couldn't roll back (connection dropped); the next Save cleans it up first.
export async function loadPendingShare(key) {
  if (!hasCaches()) return null;
  const cache = await caches.open(SHARE_CACHE);
  const metaRes = await cache.match(`/share-pending/${key}/meta`);
  if (!metaRes) return null;
  const meta = await metaRes.json();
  const files = [];
  for (let i = 0; i < meta.files.length; i++) {
    const res = await cache.match(`/share-pending/${key}/file/${i}`);
    if (!res) continue;
    const { name, type } = meta.files[i];
    if (!SHARE_TYPES.includes(type)) continue;
    files.push(new File([await res.blob()], name, { type }));
  }
  return { title: meta.title, text: meta.text, url: meta.url, files, orphan: meta.orphan || null };
}

export async function setShareOrphan(key, orphan) {
  if (!hasCaches()) return;
  const cache = await caches.open(SHARE_CACHE);
  const metaRes = await cache.match(`/share-pending/${key}/meta`);
  if (!metaRes) return;
  const meta = { ...(await metaRes.json()), orphan };
  await cache.put(`/share-pending/${key}/meta`, new Response(JSON.stringify(meta), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

// Called on explicit logout: shares have no owner, so they must not carry over
// to the next account on a shared device.
export async function clearPendingShares() {
  if (hasCaches()) await caches.delete(SHARE_CACHE);
}

export async function deletePendingShare(key) {
  if (!hasCaches()) return;
  const cache = await caches.open(SHARE_CACHE);
  for (const req of await cache.keys()) {
    if (new URL(req.url).pathname.startsWith(`/share-pending/${key}/`)) await cache.delete(req);
  }
}
