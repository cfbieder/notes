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
  preview: document.getElementById('preview'),
  asSourceRow: document.getElementById('asSourceRow'),
  asSource: document.getElementById('asSource'),
  sourceFields: document.getElementById('sourceFields'),
  noteFields: document.getElementById('noteFields'),
  srcKind: document.getElementById('srcKind'),
  srcPublished: document.getElementById('srcPublished'),
  srcAuthors: document.getElementById('srcAuthors'),
  srcContainer: document.getElementById('srcContainer'),
  chapters: document.getElementById('chapters'),
  bookName: document.getElementById('bookName'),
  openExisting: document.getElementById('openExisting')
};

// CR039 A2 state: what the page's metadata said, and the research context.
let extracted = null;
let research = { supported: false };

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

// --- CR039 A2: research sources -------------------------------------------

async function extractCitation(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['metadata.js'] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__notedExtractCitation()
    });
    return result;
  } catch (_) {
    return null; // restricted page (chrome://, web store, PDF viewer)
  }
}

function authorsToText(authors) {
  return (authors || []).map(a => (a.literal ? a.literal : a.given ? `${a.family}, ${a.given}` : `${a.family},`)).join('\n');
}

// One per line: "Family, Given" → person, "Family," → person, no comma → organization.
function textToAuthors(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const i = line.indexOf(',');
    if (i === -1) return { literal: line };
    const family = line.slice(0, i).trim();
    const given = line.slice(i + 1).trim();
    return given ? { family, given } : { family };
  });
}

// "YYYY" | "YYYY-MM" | "YYYY-MM-DD" → { published_date, published_precision }; null if invalid.
function parsePublished(text) {
  const t = text.trim();
  if (!t) return { published_date: null, published_precision: null };
  let m = t.match(/^(\d{4})$/);
  if (m) return { published_date: `${m[1]}-01-01`, published_precision: 'year' };
  m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { published_date: `${m[1]}-${m[2].padStart(2, '0')}-01`, published_precision: 'month' };
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) return { published_date: iso, published_precision: 'day' };
  }
  return null;
}

function renderChapters(chapters, preselected) {
  els.chapters.textContent = '';
  if (!chapters.length) {
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = research.book ? 'No chapters yet — add them in Noted → Settings → Research.' : 'No active book.';
    els.chapters.appendChild(span);
    return;
  }
  for (const c of chapters) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = c.id;
    box.checked = preselected.includes(c.id);
    label.appendChild(box);
    label.appendChild(document.createTextNode(` ${c.label} · ${c.title}`));
    els.chapters.appendChild(label);
  }
}

function applySourceMode() {
  const on = els.asSource.checked;
  els.sourceFields.classList.toggle('hidden', !on);
  els.noteFields.classList.toggle('hidden', on);
  // A screenshot is not a citable text body (CR039 §6.1).
  const shot = els.mode.querySelector('option[value="screenshot"]');
  shot.disabled = on;
  if (on && els.mode.value === 'screenshot') els.mode.value = 'article';
}

async function initResearch(tab) {
  const info = await send({ type: 'researchInfo' });
  if (!info?.ok || !info.data.supported) return; // older server: plain clips only
  research = info.data;

  extracted = tab?.id ? await extractCitation(tab.id) : null;
  if (extracted) {
    els.srcKind.value = extracted.source_kind;
    els.srcPublished.value = extracted.published || '';
    els.srcAuthors.value = authorsToText(extracted.authors);
    els.srcContainer.value = extracted.container || '';
  }

  const { lastChapterIds = [] } = await chrome.storage.local.get('lastChapterIds');
  els.bookName.textContent = research.book ? `— ${research.book.title}` : '';
  renderChapters(research.chapters, lastChapterIds);

  els.asSourceRow.classList.remove('hidden');
  // On by default when a book is active (CR039 §8.2).
  els.asSource.checked = !!research.book;
  if (els.asSource.checked && extracted?.title) els.title.value = extracted.title;
  applySourceMode();
}

function sourcePayload() {
  const published = parsePublished(els.srcPublished.value);
  if (published === null) throw new Error('Published must be YYYY, YYYY-MM or YYYY-MM-DD');
  const x = extracted || {};
  const orNull = (v) => (v && String(v).trim()) || null;
  return {
    metadata: {
      source_kind: els.srcKind.value,
      title: orNull(els.title.value) || orNull(x.title) || undefined,
      authors: textToAuthors(els.srcAuthors.value),
      container: orNull(els.srcContainer.value),
      publisher: orNull(x.publisher),
      volume: orNull(x.volume),
      issue: orNull(x.issue),
      pages: orNull(x.pages),
      doi: orNull(x.doi),
      isbn: orNull(x.isbn),
      url: orNull(x.url),
      ...published
    },
    metadata_raw: x.raw || undefined,
    chapter_ids: [...els.chapters.querySelectorAll('input:checked')].map(b => b.value)
  };
}

function showExisting(data) {
  els.openExisting.textContent = data.in_trash ? 'Open Trash' : 'Open existing source';
  els.openExisting.onclick = () => {
    chrome.tabs.create({ url: `${research.appBase}${data.in_trash ? '/trash' : `/notes/${data.note_id}`}` });
  };
  els.openExisting.classList.remove('hidden');
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

  await initResearch(tab);

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

els.asSource.addEventListener('change', applySourceMode);

els.clipBtn.addEventListener('click', async () => {
  els.clipBtn.disabled = true;
  els.openExisting.classList.add('hidden');
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
    const asSource = !els.asSource.closest('.hidden') && els.asSource.checked;
    if (asSource) {
      Object.assign(payload, { as_source: true }, sourcePayload());
      await chrome.storage.local.set({ lastChapterIds: payload.chapter_ids });
    }

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
    if (!res?.ok) {
      if (res?.status === 409 && res.body?.error === 'source_exists') {
        setStatus(res.error, 'error');
        showExisting(res.body.data);
        els.clipBtn.disabled = false;
        return;
      }
      throw new Error(res?.error || 'Clip failed');
    }
    setStatus(asSource ? 'Saved as source ✓' : 'Saved to Noted ✓', 'success');
    setTimeout(() => window.close(), 800);
  } catch (err) {
    setStatus(err.message || String(err), 'error');
    els.clipBtn.disabled = false;
  }
});

loadSettingsAndInit();
