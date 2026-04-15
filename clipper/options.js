const els = {
  apiBase: document.getElementById('apiBase'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  status: document.getElementById('status'),
  loggedInAs: document.getElementById('loggedInAs')
};

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = kind;
}

async function refreshView() {
  const res = await send({ type: 'getSettings' });
  const s = res?.data || {};
  els.apiBase.value = s.apiBase || 'http://localhost:3001/api/v1';
  if (s.accessToken) {
    els.loggedInAs.textContent = 'Signed in. Close this page and clip from the toolbar icon.';
  } else {
    els.loggedInAs.textContent = 'Not signed in.';
  }
}

els.loginBtn.addEventListener('click', async () => {
  setStatus('Logging in...', '');
  const res = await send({
    type: 'login',
    apiBase: els.apiBase.value.trim(),
    username: els.username.value,
    password: els.password.value
  });
  if (res?.ok) {
    setStatus('Logged in ✓', 'success');
    els.password.value = '';
    refreshView();
  } else {
    setStatus(res?.error || 'Login failed', 'error');
  }
});

els.logoutBtn.addEventListener('click', async () => {
  await send({ type: 'logout' });
  setStatus('Logged out', '');
  refreshView();
});

refreshView();
