// Noted Web Clipper — background service worker.
// Handles auth state, token refresh, API calls, and context-menu "Clip selection".

// Set your Noted instance URL on the extension's options page.
const DEFAULT_API_BASE = 'http://localhost:3001/api/v1';

async function getSettings() {
  const { apiBase, accessToken, refreshToken, tokenExpiresAt } =
    await chrome.storage.local.get(['apiBase', 'accessToken', 'refreshToken', 'tokenExpiresAt']);
  return {
    apiBase: apiBase || DEFAULT_API_BASE,
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    tokenExpiresAt: tokenExpiresAt || 0
  };
}

async function saveTokens({ accessToken, refreshToken }) {
  // Access tokens are short-lived (15m). Store expiry so we refresh early.
  const tokenExpiresAt = Date.now() + 13 * 60 * 1000;
  await chrome.storage.local.set({ accessToken, refreshToken, tokenExpiresAt });
}

async function login({ apiBase, username, password }) {
  const base = apiBase || DEFAULT_API_BASE;
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Login failed (${res.status})`);
  }
  const json = await res.json();
  const accessToken = json?.data?.accessToken;
  const refreshToken = json?.data?.refreshToken;
  if (!accessToken) throw new Error('Login response missing accessToken');
  await chrome.storage.local.set({ apiBase: base });
  await saveTokens({ accessToken, refreshToken });
  return true;
}

async function refreshAccessToken() {
  const { apiBase, refreshToken } = await getSettings();
  if (!refreshToken) throw new Error('Not logged in');
  const res = await fetch(`${apiBase}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  if (!res.ok) {
    // Wipe stored tokens so the popup shows the "not logged in" view
    // instead of looping on bad credentials.
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'tokenExpiresAt']);
    throw new Error('Refresh failed — please log in again');
  }
  const json = await res.json();
  // /auth/refresh returns a flat shape; /auth/login wraps in { data: ... }.
  // Handle both so this helper is reusable if we ever unify them.
  const body = json.data || json;
  await saveTokens({
    accessToken: body.accessToken,
    refreshToken: body.refreshToken || refreshToken
  });
}

async function authFetch(path, init = {}) {
  let { apiBase, accessToken, tokenExpiresAt } = await getSettings();
  if (!accessToken) throw new Error('Not logged in — open the extension options page.');
  if (Date.now() >= tokenExpiresAt) {
    await refreshAccessToken();
    ({ accessToken } = await getSettings());
  }
  const headers = {
    ...(init.headers || {}),
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
  let res = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (res.status === 401) {
    await refreshAccessToken();
    ({ accessToken } = await getSettings());
    headers['Authorization'] = `Bearer ${accessToken}`;
    res = await fetch(`${apiBase}${path}`, { ...init, headers });
  }
  return res;
}

async function postClip(payload) {
  const res = await authFetch('/clips', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Keep status + body so the popup can act on e.g. 409 source_exists.
    const err = new Error(body.message || `Clip failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body.data;
}

// CR039 — research support + the active book's chapters. A server without
// research routes answers 404, and the popup then hides "Save as source".
async function researchInfo() {
  const res = await authFetch('/books');
  if (res.status === 404) return { supported: false };
  if (!res.ok) throw new Error(`Could not load books (${res.status})`);
  const books = (await res.json().catch(() => ({}))).data || [];
  const active = books.find(b => b.is_active) || null;
  let chapters = [];
  if (active) {
    const chRes = await authFetch(`/books/${active.id}/chapters`);
    if (chRes.ok) chapters = (await chRes.json().catch(() => ({}))).data || [];
  }
  const { apiBase } = await getSettings();
  return { supported: true, book: active, chapters, appBase: apiBase.replace(/\/api\/v1\/?$/, '') };
}

async function listNotebooks() {
  const res = await authFetch('/notebooks');
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  return body.data || [];
}

async function captureVisibleTabAsDataUrl(tabId) {
  const tab = await chrome.tabs.get(tabId);
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}

async function runInTab(tabId, func, args = []) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: 'MAIN'
  });
  return result;
}

// Message router — popup.js and context menu both call here.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'login':
          sendResponse({ ok: true, data: await login(msg) });
          break;
        case 'logout':
          await chrome.storage.local.remove(['accessToken', 'refreshToken', 'tokenExpiresAt']);
          sendResponse({ ok: true });
          break;
        case 'getSettings':
          sendResponse({ ok: true, data: await getSettings() });
          break;
        case 'listNotebooks':
          sendResponse({ ok: true, data: await listNotebooks() });
          break;
        case 'clip':
          sendResponse({ ok: true, data: await postClip(msg.payload) });
          break;
        case 'researchInfo':
          sendResponse({ ok: true, data: await researchInfo() });
          break;
        case 'captureVisible': {
          const dataUrl = await captureVisibleTabAsDataUrl(msg.tabId);
          sendResponse({ ok: true, data: dataUrl });
          break;
        }
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      console.error('[noted clipper]', err);
      sendResponse({ ok: false, error: err.message || String(err), status: err.status, body: err.body });
    }
  })();
  return true; // keep channel open for async sendResponse
});

// Context menu — right-click on a selection → clip it directly.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'noted-clip-selection',
    title: 'Clip selection to Noted',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'noted-clip-page',
    title: 'Clip page to Noted',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    if (info.menuItemId === 'noted-clip-selection') {
      await postClip({
        url: tab.url,
        title: tab.title,
        content: info.selectionText || '',
        mode: 'selection',
        send_to_inbox: true
      });
    } else if (info.menuItemId === 'noted-clip-page') {
      // Ask popup to run — simpler path: open the popup instead.
      await chrome.action.openPopup?.().catch(() => {});
    }
  } catch (err) {
    console.error('[noted clipper] context menu:', err);
  }
});
