<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, markRaw } from 'vue';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-vue-next';
import HighlightPopover from './HighlightPopover.vue';
import { useToastsStore } from '../../stores/toasts.js';

// CR039 Phase D — a PDF.js viewer with page-anchored highlights (§10.3), built to
// be shared with CR025 (D6). The caller supplies the bytes (§16 #16: fetched with
// the auth header, so no credential goes in a URL). Pages render only near the
// viewport, so a 300-page PDF stays light. Highlight rects are stored
// normalized to the page (0–1) and drawn in percentages, so they hold at any zoom.
const props = defineProps({
  fetchBytes: { type: Function, required: true }, // () => Promise<ArrayBuffer>
  // Declared as a prop (bound by @create) so the save can be awaited: it
  // resolves true on success, and the popover stays open on failure.
  onCreate: { type: Function, required: true },
  highlights: { type: Array, default: () => [] },
  chapters: { type: Array, default: () => [] },
  defaultChapterId: { type: String, default: '' },
  revealId: { type: String, default: '' }, // open at this highlight once loaded (?hl=)
  active: { type: Boolean, default: true } // false while hidden behind the Text view
});
const emit = defineEmits(['select-highlight']);
const toasts = useToastsStore();

const MAX_EXACT = 5000; // the API's limit on a quote
const MAX_RECTS = 200;
const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const MAX_CANVAS_PIXELS = 2 ** 24; // iOS Safari's per-canvas limit (16.7 MP)

const scrollEl = ref(null);
const pagesEl = ref(null);
const pages = ref([]); // { index, label, w, h } in PDF points (scale 1)
const scale = ref(1);
const status = ref('loading'); // loading | ready | error
const errorMsg = ref('');
const noText = ref(false); // every page rendered so far had no text layer (a scan)
const popover = ref(null); // { top, left, exact, page_index, page_label, rects }
const popoverSeq = ref(0); // a fresh popover (empty draft) per selection
const saving = ref(false);
const flashId = ref(null);

let pdfjs = null;
let loadingTask = null;
let doc = null;
let observer = null;
let pendingReveal = null;
let unmounted = false;
let lastScrollTop = 0;
const pageEls = new Map(); // page index → element
const rendered = new Map(); // page index → { scale, task, textLayer }
const visible = new Set();

// Lazy: PDF.js and its worker load only when a PDF is opened. Vite bundles the
// worker (?worker) so it ships as .js — prod nginx serves .mjs as
// application/octet-stream, which browsers refuse for a module worker.
// Each viewer owns its worker and destroys it on unmount, so a viewer closing
// can never break another one opening (CR025 may show two at once).
async function loadPdfjs() {
  const [lib, { default: PdfWorker }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?worker')
  ]);
  return { lib, PdfWorker };
}
let pdfWorker = null;

const marksByPage = computed(() => {
  const by = new Map();
  for (const h of props.highlights) {
    if (h.anchor_type !== 'pdf' || h.page_index == null || !Array.isArray(h.rects)) continue;
    if (!by.has(h.page_index)) by.set(h.page_index, []);
    h.rects.forEach((r, n) => by.get(h.page_index).push({ key: `${h.id}:${n}`, hid: h.id, color: h.color, comment: h.comment, ...r }));
  }
  return by;
});

function setPageEl(index, el) {
  if (el) {
    pageEls.set(index, el);
    observer?.observe(el);
  } else {
    pageEls.delete(index);
  }
}

function teardown(i) {
  const entry = rendered.get(i);
  if (!entry) return;
  entry.task?.cancel();
  entry.textLayer?.cancel();
  entry.page?.cleanup(); // release its operator list and decoded images
  rendered.delete(i);
  const el = pageEls.get(i);
  if (el) {
    const canvas = el.querySelector('canvas');
    canvas.width = 0;
    canvas.height = 0;
    el.querySelector('.textLayer').replaceChildren();
  }
}

async function renderPage(i) {
  const el = pageEls.get(i);
  if (!el || !doc) return;
  if (rendered.get(i)?.scale === scale.value) return;
  teardown(i);
  const entry = { scale: scale.value, task: null, textLayer: null, page: null };
  rendered.set(i, entry);
  const stale = () => rendered.get(i) !== entry;
  try {
    const page = await doc.getPage(i + 1);
    if (stale()) return;
    entry.page = page;
    const viewport = page.getViewport({ scale: entry.scale });
    // Cap the backing store; CSS stretches the canvas to the page box anyway.
    const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
    const canvas = el.querySelector('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    entry.task = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
    });
    await entry.task.promise;
    if (stale()) return;
    const content = await page.getTextContent();
    if (stale()) return;
    const layer = el.querySelector('.textLayer');
    layer.replaceChildren();
    entry.textLayer = new pdfjs.TextLayer({ textContentSource: content, container: layer, viewport });
    await entry.textLayer.render();
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') {
      console.warn('PDF page render failed', i + 1, err);
      if (!stale()) rendered.delete(i); // let a later scroll retry it
    }
  }
}

let fitPending = false;
function fitWidth() {
  if (!scrollEl.value || !pages.value.length) return;
  if (!scrollEl.value.clientWidth) { // hidden behind the Text view: fit on return
    fitPending = true;
    return;
  }
  fitPending = false;
  const widest = Math.max(...pages.value.map(p => p.w));
  setScale((scrollEl.value.clientWidth - 32) / widest);
}

function setScale(next) {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(next * 100) / 100));
  if (s === scale.value) return;
  const box = scrollEl.value;
  const ratio = box && box.scrollHeight ? box.scrollTop / box.scrollHeight : 0;
  popover.value = null;
  scale.value = s;
  nextTick(() => {
    if (box) box.scrollTop = ratio * box.scrollHeight;
    for (const i of [...rendered.keys()]) if (!visible.has(i)) teardown(i);
    visible.forEach(i => renderPage(i));
  });
}

const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`);

// ---------------------------------------------------------------- selection

function pageOf(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return el?.closest?.('.pv-page') || null;
}

// The selection's line boxes, normalized to the page and merged per line.
function selectionRects(range, pageEl) {
  const pr = pageEl.getBoundingClientRect();
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const raw = [...range.getClientRects()]
    .filter(r => r.width > 0.5 && r.height > 0.5 && r.height < pr.height * 0.2)
    .filter(r => {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return cx >= pr.left && cx <= pr.right && cy >= pr.top && cy <= pr.bottom;
    })
    .map(r => {
      const x = clamp((r.left - pr.left) / pr.width);
      const y = clamp((r.top - pr.top) / pr.height);
      return { x, y, w: clamp((r.right - pr.left) / pr.width) - x, h: clamp((r.bottom - pr.top) / pr.height) - y };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  for (const r of raw) {
    const m = merged[merged.length - 1];
    if (m && Math.abs(m.y - r.y) < Math.min(m.h, r.h) * 0.5 && r.x <= m.x + m.w + 0.02 && r.x + r.w >= m.x - 0.02) {
      const right = Math.max(m.x + m.w, r.x + r.w);
      const bottom = Math.max(m.y + m.h, r.y + r.h);
      m.x = Math.min(m.x, r.x);
      m.y = Math.min(m.y, r.y);
      m.w = right - m.x;
      m.h = bottom - m.y;
    } else {
      merged.push({ ...r });
    }
  }
  const round = (v) => Math.round(v * 1e5) / 1e5;
  return merged.slice(0, MAX_RECTS).map(r => ({
    x: round(r.x), y: round(r.y), w: round(Math.min(r.w, 1 - r.x)), h: round(Math.min(r.h, 1 - r.y))
  }));
}

function onMouseUp() {
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !pagesEl.value) return;
    const range = sel.getRangeAt(0);
    if (!pagesEl.value.contains(range.commonAncestorContainer)) return;
    const startPage = pageOf(range.startContainer);
    if (!startPage) return;
    if (pageOf(range.endContainer) !== startPage) {
      toasts.addToast({ message: 'Select within one page — a highlight belongs to a single page', type: 'info' });
      return;
    }
    const exact = sel.toString().replace(/\s+/g, ' ').trim();
    if (!exact) return;
    if (exact.length > MAX_EXACT) {
      toasts.addToast({ message: `Select a shorter passage (up to ${MAX_EXACT.toLocaleString()} characters)`, type: 'info' });
      return;
    }
    const rects = selectionRects(range, startPage);
    if (!rects.length) return;
    const index = Number(startPage.dataset.index);
    const rect = range.getBoundingClientRect();
    const host = pagesEl.value.getBoundingClientRect();
    popoverSeq.value++;
    popover.value = {
      top: rect.bottom - host.top + 8,
      left: Math.max(0, Math.min(rect.left - host.left, host.width - 300)),
      exact,
      page_index: index,
      page_label: pages.value[index]?.label || String(index + 1),
      rects
    };
  }, 0);
}

// Clicking a highlighted passage selects it in the sidebar. The text layer sits
// above the marks (so text stays selectable), so hit-test by position.
function onClick(e) {
  if (!window.getSelection()?.isCollapsed) return;
  const pageEl = pageOf(e.target);
  if (!pageEl) return;
  const pr = pageEl.getBoundingClientRect();
  const x = (e.clientX - pr.left) / pr.width;
  const y = (e.clientY - pr.top) / pr.height;
  const hit = (marksByPage.value.get(Number(pageEl.dataset.index)) || [])
    .find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (hit) emit('select-highlight', hit.hid);
}

async function save(fields) {
  if (!popover.value) return;
  saving.value = true;
  try {
    const { exact, page_index, page_label, rects } = popover.value;
    if (await props.onCreate({ anchor_type: 'pdf', exact, page_index, page_label, rects, ...fields })) {
      popover.value = null;
      window.getSelection()?.removeAllRanges();
    }
  } finally {
    saving.value = false;
  }
}

// Scroll to and flash a highlight (from the sidebar, or ?hl= from Passages/search).
function reveal(id) {
  const h = props.highlights.find(x => x.id === id);
  if (!h || h.page_index == null) return false;
  if (status.value !== 'ready') {
    pendingReveal = id;
    return true;
  }
  const el = pageEls.get(h.page_index);
  if (!el || !scrollEl.value) return false;
  const box = scrollEl.value;
  const y = (h.rects?.[0]?.y || 0) * el.offsetHeight;
  const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top + y - box.clientHeight / 3;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  box.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  flashId.value = id;
  setTimeout(() => { if (flashId.value === id) flashId.value = null; }, 1400);
  return true;
}
defineExpose({ reveal });

// ?hl= arrives before the PDF has loaded: reveal once both it and the
// highlight are here.
let revealedFromProp = '';
watch(() => [status.value, props.revealId, props.highlights.length], () => {
  const id = props.revealId;
  if (status.value !== 'ready' || !id || id === revealedFromProp) return;
  if (!props.highlights.some(h => h.id === id)) return;
  revealedFromProp = id;
  nextTick(() => reveal(id));
});

function onKey(e) {
  if (e.key === 'Escape') popover.value = null;
}

// v-show hides the viewer behind the Text view, and display:none drops the
// scroll offset: remember it and put the reader back where they were.
function onScroll() {
  if (scrollEl.value?.clientHeight) lastScrollTop = scrollEl.value.scrollTop;
}
watch(() => props.active, (on) => {
  if (!on) return;
  nextTick(() => {
    if (fitPending) fitWidth();
    else if (scrollEl.value) scrollEl.value.scrollTop = lastScrollTop;
  });
});

// A scan has no text layer. Decide once from a sample (front pages plus the
// middle), not from whichever pages happen to render first: many books open on
// an image cover or a blank page.
async function detectNoText() {
  const n = doc.numPages;
  const sample = [...new Set([1, 2, 3, 4, 5, Math.ceil(n / 2)].filter(p => p <= n))];
  for (const p of sample) {
    const content = await (await doc.getPage(p)).getTextContent();
    if (unmounted) return;
    if (content.items.some(it => it.str && it.str.trim())) return;
  }
  noText.value = true;
}

onMounted(async () => {
  document.addEventListener('keydown', onKey);
  try {
    const [{ lib, PdfWorker }, bytes] = await Promise.all([loadPdfjs(), props.fetchBytes()]);
    if (unmounted) return;
    pdfjs = lib;
    pdfWorker = new lib.PDFWorker({ port: new PdfWorker() });
    loadingTask = lib.getDocument({ data: new Uint8Array(bytes), worker: pdfWorker });
    doc = markRaw(await loadingTask.promise);
    if (unmounted) return;
    const labels = await doc.getPageLabels().catch(() => null);
    const viewports = await Promise.all(
      Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1).then(p => p.getViewport({ scale: 1 })))
    );
    if (unmounted) return;
    pages.value = viewports.map((v, i) => ({
      index: i,
      // The printed page number ("xii", "147"), not the PDF index (§10.3).
      label: String(labels?.[i] || i + 1).slice(0, 20),
      w: v.width,
      h: v.height
    }));
    observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const i = Number(en.target.dataset.index);
        if (en.isIntersecting) {
          visible.add(i);
          renderPage(i);
        } else {
          visible.delete(i);
          teardown(i);
        }
      }
    }, { root: scrollEl.value, rootMargin: '800px 0px' });
    await nextTick();
    pageEls.forEach(el => observer.observe(el));
    fitWidth();
    await nextTick(); // let the fit's scroll restore run before any reveal
    status.value = 'ready';
    detectNoText().catch(() => {});
    if (pendingReveal) {
      const id = pendingReveal;
      pendingReveal = null;
      setTimeout(() => reveal(id), 50);
    }
  } catch (err) {
    if (unmounted) return;
    status.value = 'error';
    errorMsg.value = err.message || 'Could not open the PDF';
  }
});

onBeforeUnmount(() => {
  unmounted = true; // a load still in flight stops at its next await
  document.removeEventListener('keydown', onKey);
  observer?.disconnect();
  [...rendered.keys()].forEach(teardown);
  const port = pdfWorker?.port;
  Promise.resolve(loadingTask?.destroy())
    .then(() => pdfWorker?.destroy())
    .catch(() => {})
    .finally(() => port?.terminate?.()); // a worker given as a port is ours to stop
});
</script>

<template>
  <div class="pv">
    <div class="pv-bar" role="toolbar" aria-label="PDF view">
      <button class="pv-btn" title="Zoom out" aria-label="Zoom out" :disabled="status !== 'ready'" @click="setScale(scale / 1.2)"><ZoomOut :size="14" /></button>
      <span class="pv-zoom" aria-live="polite">{{ zoomLabel }}</span>
      <button class="pv-btn" title="Zoom in" aria-label="Zoom in" :disabled="status !== 'ready'" @click="setScale(scale * 1.2)"><ZoomIn :size="14" /></button>
      <button class="pv-btn" title="Fit to width" aria-label="Fit to width" :disabled="status !== 'ready'" @click="fitWidth"><Maximize2 :size="14" /></button>
      <span v-if="pages.length" class="pv-count">{{ pages.length }} page{{ pages.length === 1 ? '' : 's' }}</span>
    </div>
    <p v-if="noText" class="pv-note" role="status">
      This PDF seems to have no selectable text (a scanned image), so it can't be highlighted yet. Any text read from it is under <strong>Text</strong>.
    </p>
    <p v-if="status === 'loading'" class="pv-note" role="status">Opening the PDF…</p>
    <p v-else-if="status === 'error'" class="pv-error" role="alert">{{ errorMsg }}</p>
    <div v-show="status !== 'error'" ref="scrollEl" class="pv-scroll" @mouseup="onMouseUp" @click="onClick" @scroll.passive="onScroll">
      <div ref="pagesEl" class="pv-pages">
        <div v-for="p in pages" :key="p.index" :ref="el => setPageEl(p.index, el)" class="pv-page" :data-index="p.index"
             :style="{ width: `${Math.floor(p.w * scale)}px`, height: `${Math.floor(p.h * scale)}px`, '--total-scale-factor': scale }"
             role="group" :aria-label="`Page ${p.label}`">
          <canvas class="pv-canvas" />
          <div class="pv-marks" aria-hidden="true">
            <div v-for="r in marksByPage.get(p.index) || []" :key="r.key"
                 :class="['pv-mark', `hl-${r.color}`, { flash: flashId === r.hid }]"
                 :style="{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }" />
          </div>
          <div class="textLayer" />
          <span class="pv-label">{{ p.label }}</span>
        </div>
        <HighlightPopover v-if="popover" :key="popoverSeq" :style="{ top: `${popover.top}px`, left: `${popover.left}px` }"
                          :chapters="chapters" :defaultChapterId="defaultChapterId" :saving="saving"
                          @save="save" @cancel="popover = null" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pv { display: flex; flex-direction: column; gap: 8px; }
.pv-bar { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
.pv-btn {
  display: inline-flex; align-items: center; background: transparent; color: var(--text-primary);
  border: 1px solid var(--border-strong); border-radius: 6px; padding: 4px 7px; cursor: pointer;
}
.pv-btn:hover:not(:disabled) { background: var(--hover-bg); }
.pv-btn:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }
.pv-btn:disabled { opacity: 0.5; cursor: default; }
.pv-zoom { min-width: 40px; text-align: center; }
.pv-count { margin-left: 8px; color: var(--text-muted); }
.pv-note { margin: 0; font-size: 12px; color: var(--text-muted); }
.pv-error { margin: 0; font-size: 13px; color: var(--status-error); }
.pv-scroll {
  height: calc(100vh - 170px); min-height: 400px; overflow: auto;
  background: var(--bg-main); border: 1px solid var(--border-subtle); border-radius: 8px;
}
.pv-pages { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 14px; width: max-content; min-width: 100%; box-sizing: border-box; }
.pv-page { position: relative; background: #fff; box-shadow: var(--shadow-md); --scale-round-x: 1px; --scale-round-y: 1px; }
.pv-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.pv-marks { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.pv-mark { position: absolute; mix-blend-mode: multiply; border-radius: 2px; }
.pv-mark.hl-yellow { background: rgba(250, 204, 21, 0.45); }
.pv-mark.hl-red { background: rgba(248, 113, 113, 0.45); }
.pv-mark.hl-green { background: rgba(74, 222, 128, 0.42); }
.pv-mark.hl-blue { background: rgba(96, 165, 250, 0.45); }
.pv-mark.flash { outline: 2px solid var(--accent-primary); }
.pv-label { position: absolute; bottom: -1px; right: 4px; transform: translateY(100%); font-size: 10px; color: var(--text-muted); }

/* PDF.js text layer: transparent text over the canvas, for selection only.
   A minimal copy of pdf_viewer.css's .textLayer rules (the full sheet styles a
   whole viewer app we don't use). */
.pv-page :deep(.textLayer) {
  position: absolute; inset: 0; z-index: 2; overflow: clip; opacity: 1;
  line-height: 1; text-align: initial; letter-spacing: normal; word-spacing: normal;
  text-size-adjust: none; forced-color-adjust: none; transform-origin: 0 0;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}
.pv-page :deep(.textLayer :is(span, br)) {
  color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; user-select: text;
}
.pv-page :deep(.textLayer > :not(.markedContent)),
.pv-page :deep(.textLayer .markedContent span:not(.markedContent)) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.pv-page :deep(.textLayer .markedContent) { display: contents; }
/* Pages with /Rotate: the layer is sized unrotated and turned into place. */
.pv-page :deep(.textLayer[data-main-rotation="90"]) { transform: rotate(90deg) translateY(-100%); }
.pv-page :deep(.textLayer[data-main-rotation="180"]) { transform: rotate(180deg) translate(-100%, -100%); }
.pv-page :deep(.textLayer[data-main-rotation="270"]) { transform: rotate(270deg) translateX(-100%); }
.pv-page :deep(.textLayer ::selection) { background: rgba(0, 100, 255, 0.25); }
.pv-page :deep(.textLayer .endOfContent) { display: block; position: absolute; inset: 100% 0 0; z-index: 0; cursor: default; user-select: none; }
</style>
