// CR039 — normalize a source URL so the per-user unique index catches the same
// page clipped twice under cosmetic differences: lowercase scheme and host
// (done by URL), fragment dropped, tracking params dropped, trailing slash
// trimmed. Returns null for empty input; throws on anything that is not an
// absolute http(s) URL.

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'dclid', 'mc_cid', 'mc_eid', 'ref_src', 'igshid']);

function normalizeSourceUrl(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  let u;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error('url must be an absolute http(s) URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('url must be an absolute http(s) URL');
  }

  for (const key of [...u.searchParams.keys()]) {
    if (/^utm_/i.test(key) || TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  const search = u.searchParams.toString();
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${u.host}${path}${search ? `?${search}` : ''}`;
}

module.exports = { normalizeSourceUrl };
