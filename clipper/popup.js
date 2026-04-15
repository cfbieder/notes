// Popup controller — extracts page content based on mode and posts a clip.

const els = {
  notLoggedIn: document.getElementById('notLoggedIn'),
  main: document.getElementById('main'),
  openOptions: document.getElementById('openOptions'),
  openOptionsBtn: document.getElementById('openOptionsBtn'),
  mode: document.getElementById('mode'),
  title: document.getElementById('title'),
  notebook: document.getElementById('notebook'),
  tags: document.getElementById('tags'),
  sendToInbox: document.getElementById('sendToInbox'),
  clipBtn: document.getElementById('clipBtn'),
  status: document.getElementById('status'),
  preview: document.getElementById('preview')
};

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = kind;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Run inside the active tab — returns raw page data to be converted by the popup.
async function extractPageData(tabId, mode) {
  // First inject vendor libraries — only for modes that need them.
  if (mode === 'article' || mode === 'selection') {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['vendor/Readability.js', 'vendor/turndown.js']
    });
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (mode) => {
      const pageTitle = document.title || '';
      const pageUrl = location.href;

      if (mode === 'link') {
        return { title: pageTitle, url: pageUrl, contentMarkdown: '' };
      }

      if (mode === 'selection') {
        const selection = window.getSelection();
        const text = selection ? selection.toString() : '';
        // Try to grab HTML of the selection and convert with Turndown for
        // richer output; fall back to plain text.
        let selectionHtml = '';
        if (selection && selection.rangeCount > 0) {
          const container = document.createElement('div');
          container.appendChild(selection.getRangeAt(0).cloneContents());
          selectionHtml = container.innerHTML;
        }
        let md = text;
        if (selectionHtml && typeof TurndownService !== 'undefined') {
          try {
            const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            md = turndown.turndown(selectionHtml);
          } catch (_) { /* keep plain text */ }
        }
        return { title: pageTitle, url: pageUrl, contentMarkdown: md };
      }

      if (mode === 'article') {
        // Clone the document so Readability doesn't mutate the live DOM.
        const clone = document.cloneNode(true);
        let parsed = null;
        try {
          parsed = new Readability(clone).parse();
        } catch (err) {
          return { title: pageTitle, url: pageUrl, contentMarkdown: '', error: 'Readability failed: ' + err.message };
        }
        if (!parsed) {
          return { title: pageTitle, url: pageUrl, contentMarkdown: '', error: 'No article detected on this page.' };
        }
        let md = parsed.textContent || '';
        try {
          const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
          md = turndown.turndown(parsed.content || '');
        } catch (_) { /* keep textContent */ }
        return {
          title: parsed.title || pageTitle,
          url: pageUrl,
          contentMarkdown: md
        };
      }

      // screenshot mode — page data only needed for title/url; capture happens in background.
      return { title: pageTitle, url: pageUrl, contentMarkdown: '' };
    },
    args: [mode]
  });
  return result;
}

async function loadSettingsAndInit() {
  const settings = await send({ type: 'getSettings' });
  if (!settings?.ok || !settings.data.accessToken) {
    els.notLoggedIn.classList.remove('hidden');
    return;
  }
  els.main.classList.remove('hidden');

  // Prefill title from the active tab.
  const tab = await getActiveTab();
  els.title.value = tab?.title || '';

  // Load notebooks.
  const nb = await send({ type: 'listNotebooks' });
  if (nb?.ok) {
    for (const notebook of nb.data) {
      const opt = document.createElement('option');
      opt.value = notebook.id;
      opt.textContent = notebook.name;
      els.notebook.appendChild(opt);
    }
  }
}

els.openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
els.openOptionsBtn?.addEventListener('click', () => chrome.runtime.openOptionsPage());

// Show the installed extension version so it's obvious when a reload picks
// up a new build.
const versionEl = document.getElementById('version');
if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

els.clipBtn.addEventListener('click', async () => {
  els.clipBtn.disabled = true;
  setStatus('Clipping...', '');
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('No active tab');
    const mode = els.mode.value;

    const payload = {
      url: tab.url,
      title: els.title.value || tab.title,
      mode,
      notebook_id: els.notebook.value || null,
      tag_names: els.tags.value.split(',').map(s => s.trim()).filter(Boolean),
      send_to_inbox: els.sendToInbox.checked
    };

    if (mode !== 'screenshot') {
      const data = await extractPageData(tab.id, mode);
      if (data?.error) throw new Error(data.error);
      if (data?.title) payload.title = payload.title || data.title;
      payload.content = data?.contentMarkdown || '';
    }

    if (mode === 'screenshot') {
      const cap = await send({ type: 'captureVisible', tabId: tab.id });
      if (!cap?.ok) throw new Error(cap?.error || 'Screenshot capture failed');
      payload.screenshot_data_url = cap.data;
    }

    const res = await send({ type: 'clip', payload });
    if (!res?.ok) throw new Error(res?.error || 'Clip failed');
    setStatus('Saved to Noted ✓', 'success');
    setTimeout(() => window.close(), 800);
  } catch (err) {
    setStatus(err.message || String(err), 'error');
    els.clipBtn.disabled = false;
  }
});

loadSettingsAndInit();
