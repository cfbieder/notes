/**
 * Vault emergency export — CR030.
 *
 * Produces a single self-decrypting HTML file the user can save anywhere and
 * open in ANY browser, fully offline, with no Noted app and no installed tools.
 * The file embeds only ciphertext; opening it prompts for an export passphrase,
 * derives a key in-browser, and renders the decrypted entries as a readable,
 * printable list.
 *
 * Crypto (intentionally distinct from the vault's Argon2id master key so the
 * exported file stays dependency-free and uses only native WebCrypto):
 *
 *   KDF        PBKDF2-HMAC-SHA-256, 600 000 iterations, 16-byte random salt
 *   Encrypt    AES-256-GCM, 12-byte random IV
 *   Passphrase chosen by the user at export time (NOT the vault master password)
 *
 * The decryption logic lives twice: once here (none — we only encrypt) and once
 * as plain JS text inside the generated HTML. Keep the two PBKDF2/AES params in
 * sync if they ever change.
 */

const PBKDF2_ITERATIONS = 600000;

const enc = new TextEncoder();

function bytesToB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

/**
 * Strip in-memory-only / server bookkeeping fields, keeping just the secret
 * record. Undecryptable stubs are dropped by the caller before we get here.
 */
function stripEntry(e) {
  const out = { type: e.type || 'password', name: e.name || '' };
  const keep = {
    password: ['username', 'password', 'url', 'notes'],
    key: ['password', 'notes'],
    card: ['card_number', 'expiration', 'cvv', 'notes'],
    bank: ['account_number', 'routing_number', 'swift_bic', 'notes']
  }[out.type] || ['username', 'password', 'url', 'notes'];
  for (const k of keep) {
    if (e[k]) out[k] = e[k];
  }
  return out;
}

/**
 * Encrypt the entries and return a complete standalone HTML document string.
 *
 * @param {Array<object>} entries   decrypted vault records (vault.entries)
 * @param {string} passphrase       user-chosen export passphrase
 * @param {string} exportedAtISO    ISO timestamp for the file header
 */
export async function buildEmergencyExportHtml(entries, passphrase, exportedAtISO) {
  const payload = {
    version: 1,
    exportedAt: exportedAtISO,
    entries: entries.filter(e => !e.undecryptable).map(stripEntry)
  };
  const plaintext = enc.encode(JSON.stringify(payload));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );

  const bundle = {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: bytesToB64(salt) },
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(ct),
    count: payload.entries.length,
    exportedAt: exportedAtISO
  };

  return renderHtml(bundle);
}

/**
 * Build the self-contained HTML. The embedded <script> contains the decrypt +
 * render logic; the only data baked in is the ciphertext bundle (JSON).
 */
function renderHtml(bundle) {
  // Embed as JSON inside a <script type="application/json"> so no escaping of
  // JS string literals is needed. base64 contains no "<" so it's safe.
  const bundleJson = JSON.stringify(bundle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Noted — Vault Emergency Export</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; padding: 24px; background: #0f1115; color: #e8eaed; line-height: 1.5;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #9aa0a6; font-size: 13px; margin: 0 0 20px; }
  .card {
    background: #1a1d23; border: 1px solid #2a2e37; border-radius: 12px; padding: 20px; margin-bottom: 16px;
  }
  .warn {
    background: rgba(229,57,53,0.1); border: 1px solid rgba(229,57,53,0.35);
    border-radius: 8px; padding: 10px 12px; font-size: 12px; margin: 0 0 16px; color: #f3c2c0;
  }
  label { display: block; font-size: 12px; color: #9aa0a6; margin-bottom: 6px; }
  input[type=password] {
    width: 100%; padding: 10px 12px; font-size: 14px; border-radius: 8px;
    border: 1px solid #2a2e37; background: #0f1115; color: #e8eaed;
  }
  input:focus { outline: none; border-color: #5b8def; }
  button {
    margin-top: 12px; padding: 10px 16px; font-size: 14px; font-weight: 600;
    border: none; border-radius: 8px; background: #5b8def; color: #fff; cursor: pointer;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .err { color: #f28b82; font-size: 13px; margin-top: 10px; min-height: 18px; }
  .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .toolbar input[type=search] {
    flex: 1; min-width: 160px; padding: 8px 12px; font-size: 14px; border-radius: 8px;
    border: 1px solid #2a2e37; background: #0f1115; color: #e8eaed;
  }
  .toolbar button { margin-top: 0; background: #2a2e37; }
  .entry { border: 1px solid #2a2e37; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; background: #1a1d23; }
  .entry h3 { margin: 0 0 8px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9aa0a6; border: 1px solid #2a2e37; border-radius: 4px; padding: 1px 6px; }
  .field { display: grid; grid-template-columns: 130px 1fr; gap: 8px; font-size: 13px; padding: 3px 0; }
  .field .k { color: #9aa0a6; }
  .field .v { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; white-space: pre-wrap; }
  .field a { color: #8ab4f8; }
  .hidden { display: none; }
  .count { color: #9aa0a6; font-size: 12px; margin: 0 0 12px; }
  @media print {
    body { background: #fff; color: #000; padding: 0; }
    .card, .toolbar, .warn, button { display: none !important; }
    .entry { border-color: #ccc; background: #fff; break-inside: avoid; }
    .badge { border-color: #ccc; color: #555; }
    .field .k { color: #555; }
    #results { display: block !important; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>🔐 Noted — Vault Emergency Export</h1>
  <p class="sub">Exported ${bundle.exportedAt} · ${bundle.count} ${bundle.count === 1 ? 'entry' : 'entries'} · encrypted, offline, self-contained.</p>

  <div class="card" id="gate">
    <p class="warn">This file contains your secrets encrypted with your export passphrase. Anyone who has both this file and the passphrase can read everything. Keep it somewhere safe.</p>
    <label for="pw">Export passphrase</label>
    <input type="password" id="pw" autocomplete="off" autofocus />
    <button id="go">Decrypt</button>
    <div class="err" id="err"></div>
  </div>

  <div id="results" class="hidden">
    <div class="toolbar">
      <input type="search" id="search" placeholder="Filter entries…" />
      <button id="print">Print / Save as PDF</button>
      <button id="lock">Lock</button>
    </div>
    <p class="count" id="count"></p>
    <div id="list"></div>
  </div>
</div>

<script type="application/json" id="bundle">${bundleJson}</script>
<script>
(function () {
  var bundle = JSON.parse(document.getElementById('bundle').textContent);

  var LABELS = {
    username: 'Username', password: 'Password', url: 'URL', notes: 'Notes',
    card_number: 'Card number', expiration: 'Expiration', cvv: 'Security code',
    account_number: 'Account number', routing_number: 'Routing number', swift_bic: 'SWIFT / BIC'
  };
  var ORDER = {
    password: ['username', 'password', 'url', 'notes'],
    key: ['password', 'notes'],
    card: ['card_number', 'expiration', 'cvv', 'notes'],
    bank: ['account_number', 'routing_number', 'swift_bic', 'notes']
  };
  var TYPE_LABEL = { password: 'Password', key: 'Key', card: 'Card', bank: 'Bank' };

  function b64ToBytes(b64) {
    var s = atob(b64), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function decrypt(passphrase) {
    var keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    var key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBytes(bundle.kdf.salt), iterations: bundle.kdf.iterations, hash: bundle.kdf.hash },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    var pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(bundle.iv) },
      key,
      b64ToBytes(bundle.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(pt));
  }

  var allEntries = [];

  function fieldHtml(type, entry) {
    var order = ORDER[type] || ORDER.password;
    var rows = '';
    for (var i = 0; i < order.length; i++) {
      var k = order[i], val = entry[k];
      if (!val) continue;
      var v;
      if (k === 'url') {
        var href = /^https?:\\/\\//.test(val) ? val : 'http://' + val;
        v = '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(val) + '</a>';
      } else {
        v = esc(val);
      }
      rows += '<div class="field"><span class="k">' + esc(LABELS[k] || k) + '</span><span class="v">' + v + '</span></div>';
    }
    return rows;
  }

  function render(filter) {
    var list = document.getElementById('list');
    var q = (filter || '').trim().toLowerCase();
    var shown = 0, html = '';
    for (var i = 0; i < allEntries.length; i++) {
      var e = allEntries[i];
      var hay = (e.name + ' ' + (e.username || '') + ' ' + (e.url || '')).toLowerCase();
      if (q && hay.indexOf(q) === -1) continue;
      shown++;
      var type = e.type || 'password';
      html += '<div class="entry"><h3>' + esc(e.name || '(no name)') +
        ' <span class="badge">' + esc(TYPE_LABEL[type] || type) + '</span></h3>' +
        fieldHtml(type, e) + '</div>';
    }
    list.innerHTML = html || '<p class="sub">No matching entries.</p>';
    document.getElementById('count').textContent = shown + ' of ' + allEntries.length + ' shown';
  }

  document.getElementById('go').addEventListener('click', run);
  document.getElementById('pw').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') run();
  });

  async function run() {
    var err = document.getElementById('err');
    var btn = document.getElementById('go');
    var pw = document.getElementById('pw').value;
    if (!pw) { err.textContent = 'Enter your export passphrase.'; return; }
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Decrypting…';
    try {
      var data = await decrypt(pw);
      allEntries = (data.entries || []).slice().sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
      document.getElementById('pw').value = '';
      document.getElementById('gate').classList.add('hidden');
      document.getElementById('results').classList.remove('hidden');
      render('');
    } catch (e) {
      err.textContent = 'Wrong passphrase, or this file is corrupted.';
    } finally {
      btn.disabled = false; btn.textContent = 'Decrypt';
    }
  }

  document.getElementById('search').addEventListener('input', function (ev) {
    render(ev.target.value);
  });
  document.getElementById('print').addEventListener('click', function () { window.print(); });
  document.getElementById('lock').addEventListener('click', function () {
    allEntries = [];
    document.getElementById('list').innerHTML = '';
    document.getElementById('search').value = '';
    document.getElementById('results').classList.add('hidden');
    document.getElementById('gate').classList.remove('hidden');
    document.getElementById('pw').focus();
  });
})();
</script>
</body>
</html>`;
}

/**
 * Trigger a client-side download of the given HTML string.
 */
export function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
