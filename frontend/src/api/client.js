const API_BASE = '/api/v1';

let accessToken = null;
// Single in-flight refresh shared by all callers. Without this, a cold-start
// burst of ~7 concurrent requests each fires its own /auth/refresh.
let refreshInFlight = null;
const SESSION_HINT_KEY = 'noted.hasSession';

export class OfflineError extends Error {
  constructor(message = 'Network unavailable') {
    super(message);
    this.name = 'OfflineError';
    this.offline = true;
  }
}

function isNetworkFailure(err) {
  // fetch() rejects with TypeError on network failure (DNS, offline, CORS preflight down).
  return err instanceof TypeError || err.name === 'TypeError' || !navigator.onLine;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;

  // Cold-start guard: if we have a persisted session but the in-memory access
  // token hasn't been established yet, establish it *before* firing the request
  // instead of racing the background refresh and eating a 401. Bounded so a
  // stalled refresh (offline-but-navigator.onLine, e.g. iPad Safari) can't hang
  // the app — we fall through to the normal flow (offline cache / 401-retry).
  if (
    !accessToken &&
    !options._retried &&
    !path.startsWith('/auth/') &&
    typeof navigator !== 'undefined' &&
    navigator.onLine !== false &&
    localStorage.getItem(SESSION_HINT_KEY) === '1'
  ) {
    await Promise.race([
      refreshToken(),
      new Promise((resolve) => setTimeout(resolve, 4000))
    ]);
  }

  const headers = { ...options.headers };

  // Only set Content-Type for requests with a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Fast-fail if the browser already knows it's offline. Avoids waiting on the
  // service worker, which can intercept and stall mutating requests.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OfflineError();
  }

  let res;
  try {
    res = await fetch(url, { ...options, headers, credentials: 'include' });
  } catch (err) {
    if (isNetworkFailure(err)) throw new OfflineError();
    throw err;
  }

  // Attempt token refresh on 401 (skip for auth routes to avoid loops)
  if (res.status === 401 && !options._retried && !path.startsWith('/auth/')) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return apiFetch(path, { ...options, _retried: true });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `API error ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

function refreshToken() {
  // Coalesce concurrent callers onto one network request.
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) {
        // Server reachable but rejected the refresh token — a genuine session
        // expiry, not a network blip. Drop the token and signal a redirect to
        // login (handled in App.vue). Distinct from the catch below, which is
        // a network/offline failure where we keep the session.
        accessToken = null;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('noted:session-expired'));
        }
        return false;
      }
      const data = await res.json();
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// Upload file (multipart/form-data — no Content-Type header, browser sets boundary).
// `extraFields` rides alongside the file as additional form fields; the
// backend reads them from data.fields.<name>.value.
export async function apiUpload(path, file, extraFields = {}) {
  const url = `${API_BASE}${path}`;
  const formData = new FormData();
  for (const [k, v] of Object.entries(extraFields)) {
    if (v !== undefined && v !== null && v !== '') formData.append(k, v);
  }
  // Append file last so multipart consumers that read fields-after-file via
  // data.fields work the same as fields-before-file.
  formData.append('file', file);

  const headers = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include'
  });

  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await refreshToken();
    if (refreshed) return apiUpload(path, file);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `API error ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return res.json();
}

// Convenience methods
export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => apiFetch(path, { method: 'DELETE' }),
  upload: apiUpload
};
