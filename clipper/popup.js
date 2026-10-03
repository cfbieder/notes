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
  openExisting: document.getElementById('openExisting'),
  pdfNote: document.getElementById('pdfNote'),
  snapshotRow: document.getElementById('snapshotRow'),
  srcSnapshot: document.getElementById('srcSnapshot'),
  hlSection: document.getElementById('hlSection'),
  hlQuote: document.getElementById('hlQuote'),
  hlColors: document.getElementById('hlColors'),
  hlChapter: document.getElementById('hlChapter'),
  hlComment: document.getElementById('hlComment'),
  hlBtn: document.getElementById('hlBtn'),
  hlStatus: document.getElementById('hlStatus')
};

// CR039 A2 state: what the page's metadata said, and the research context.
let extracted = null;
let research = { supported: false };
// CR039 A3: a PDF tab is saved by downloading the file (scripts can't run in
// Chrome's PDF viewer); the tab is remembered for the permission prompt.
let pdfMode = false;
let currentTab = null;
let titleEdited = false;
const isPdfUrl = (url) => /\.pdf($|[?#])/i.test(url || '') || /\/pdf\//i.test(url || '');
const originPattern = (url) => `${new URL(url).origin}/*`;

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

// --- CR039 Phase C: highlight the selection on the live page -----------------
// The quote is kept as a text-quote selector (exact + ~32 chars of context).
// Live page text differs from the stored Readability text, so the Reader
// re-anchors it when the source is next opened (exact, else fuzzy, else kept
// as unanchored — §16 #13).
let selection = null;
let hlColor = 'yellow';

async function readSelection(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
        const norm = (s) => s.replace(/\s+/g, ' ');
        const exact = norm(sel.toString()).trim();
        if (!exact) return null;
        const r = sel.getRangeAt(0);
        const before = document.createRange();
        before.setStart(document.body, 0);
        before.setEnd(r.startContainer, r.startOffset);
        const after = document.createRange();
        after.setStart(r.endContainer, r.endOffset);
        after.setEnd(document.body, document.body.childNodes.length);
        return {
          exact: exact.slice(0, 5000),
          prefix: norm(before.toString()).slice(-32),
          suffix: norm(after.toString()).slice(0, 32)
        };
      }
    });
    return result;
  } catch (_) {
    return null; // restricted page or PDF viewer
  }
}

function setHlStatus(text, kind = '') {
  els.hlStatus.textContent = text;
  els.hlStatus.className = kind;
}

async function initHighlight(tab) {
  if (!research.supported || pdfMode || !tab?.id) return;
  selection = await readSelection(tab.id);
  if (!selection) return;
  els.hlQuote.textContent = `“${selection.exact.length > 300 ? selection.exact.slice(0, 300) + '…' : selection.exact}”`;
  for (const c of research.chapters) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.label} · ${c.title}`;
    els.hlChapter.appendChild(opt);
  }
  const { lastChapterIds = [] } = await chrome.storage.local.get('lastChapterIds');
  if (lastChapterIds[0] && research.chapters.some(c => c.id === lastChapterIds[0])) els.hlChapter.value = lastChapterIds[0];
  els.hlSection.classList.remove('hidden');
}

els.hlColors.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-color]');
  if (!btn) return;
  hlColor = btn.dataset.color;
  els.hlColors.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b === btn));
});

els.hlBtn.addEventListener('click', async () => {
  els.hlBtn.disabled = true;
  setHlStatus('Saving…');
  try {
    const tab = await getActiveTab();
    // The page's source, or clip it as one first.
    const found = await send({ type: 'findSource', url: tab.url });
    if (!found?.ok) throw new Error(found?.error || 'Could not look up the page');
    let sourceId = found.data?.note_id;
    if (!sourceId) {
      setHlStatus('Clipping the page as a source…');
      const page = await extractPageData(tab.id, 'article');
      const payload = {
        url: tab.url,
        title: els.title.value || tab.title,
        mode: page?.error ? 'link' : 'article',
        content: page?.contentMarkdown || '',
        as_source: true,
        ...sourcePayload()
      };
      const clipped = await send({ type: 'clip', payload });
      if (!clipped?.ok) throw new Error(clipped?.error || 'Clipping the page failed');
      sourceId = clipped.data?.note?.id;
    }
    const chapterIds = els.hlChapter.value ? [els.hlChapter.value] : [];
    const res = await send({
      type: 'createHighlight',
      sourceId,
      body: {
        anchor_type: 'text_quote', ...selection, color: hlColor,
        comment: els.hlComment.value.trim() || null, chapter_ids: chapterIds
      }
    });
    if (!res?.ok) throw new Error(res?.error || 'Highlight failed');
    if (chapterIds.length) await chrome.storage.local.set({ lastChapterIds: chapterIds });
    setHlStatus('Highlighted ✓ — placed in the text when you open the source', 'success');
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    setHlStatus(err.message || String(err), 'error');
    els.hlBtn.disabled = false;
  }
});

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
  currentTab = tab;

  extracted = tab?.id ? await extractCitation(tab.id) : null;
  pdfMode = !extracted && isPdfUrl(tab?.url);
  if (pdfMode) {
    // The file supplies its own metadata (then AI); hide the page fields.
    els.pdfNote.classList.remove('hidden');
    els.snapshotRow.classList.add('hidden');
    for (const el of [els.srcKind.closest('.row2'), els.srcAuthors.closest('.field'), els.srcContainer.closest('.field')]) {
      el.classList.add('hidden');
    }
    els.mode.disabled = true;
  }
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
  await initHighlight(tab);

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
els.title.addEventListener('input', () => { titleEdited = true; });

els.clipBtn.addEventListener('click', async () => {
  // Permission prompts first, while this click still counts as a user gesture.
  // Both permissions are optional and asked only when this clip needs them.
  const wantsSource = !els.asSource.closest('.hidden') && els.asSource.checked;
  let snapshotAllowed = false;
  if (wantsSource && pdfMode) {
    const ok = await chrome.permissions.request({ origins: [originPattern(currentTab.url)] }).catch(() => false);
    if (!ok) {
      setStatus(`Allow access to ${new URL(currentTab.url).host} to save this PDF`, 'error');
      return;
    }
  } else if (wantsSource && els.srcSnapshot.checked) {
    snapshotAllowed = await chrome.permissions.request({ permissions: ['pageCapture'] }).catch(() => false);
  }

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
    const asSource = wantsSource;
    if (asSource && pdfMode) {
      const chapterIds = [...els.chapters.querySelectorAll('input:checked')].map(b => b.value);
      await chrome.storage.local.set({ lastChapterIds: chapterIds });
      const res = await send({
        type: 'clipPdf',
        url: tab.url,
        fields: {
          title: titleEdited ? els.title.value.trim() : '', // else the PDF (and AI) supply it
          url: tab.url,
          chapter_ids: chapterIds.length ? JSON.stringify(chapterIds) : ''
        }
      });
      if (!res?.ok) {
        if (res?.status === 409 && res.body?.error === 'source_exists') {
          setStatus(res.error, 'error');
          showExisting(res.body.data);
          els.clipBtn.disabled = false;
          return;
        }
        throw new Error(res?.error || 'Saving the PDF failed');
      }
      setStatus('PDF saved as source ✓ — AI is reading it', 'success');
      setTimeout(() => window.close(), 1500);
      return;
    }
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
    let message = asSource ? 'Saved as source ✓' : 'Saved to Noted ✓';
    if (asSource && snapshotAllowed) {
      const snap = await send({ type: 'snapshot', tabId: tab.id, noteId: res.data?.note?.id });
      message += snap?.ok ? ' (snapshot archived)' : ` (snapshot failed: ${snap?.error || 'unknown'})`;
    }
    setStatus(message, 'success');
    setTimeout(() => window.close(), 800);
  } catch (err) {
    setStatus(err.message || String(err), 'error');
    els.clipBtn.disabled = false;
  }
});

loadSettingsAndInit();
