const API_BASE = '/api/v1';

let accessToken = null;

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

  const headers = { ...options.headers };

  // Only set Content-Type for requests with a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
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

async function refreshToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

// Upload file (multipart/form-data — no Content-Type header, browser sets boundary)
export async function apiUpload(path, file) {
  const url = `${API_BASE}${path}`;
  const formData = new FormData();
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
