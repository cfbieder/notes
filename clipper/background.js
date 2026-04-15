// Noted Web Clipper — background service worker.
// Handles auth state, token refresh, API calls, and context-menu "Clip selection".

const DEFAULT_API_BASE = 'https://noted.tail413695.ts.net/api/v1';

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
  if (!res.ok) throw new Error(body.message || `Clip failed (${res.status})`);
  return body.data;
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
      sendResponse({ ok: false, error: err.message || String(err) });
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
