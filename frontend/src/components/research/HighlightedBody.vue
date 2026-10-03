<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';
import { anchor, describe } from '../../lib/anchoring.js';
import { buildTextMap, rangeToOffsets, applyMarks } from '../../lib/highlightDom.js';
import HighlightPopover from './HighlightPopover.vue';

// CR039 Phase C — the source body with its highlights. Anchoring runs here, in
// the browser, against the text actually rendered (§16 #13): each highlight is
// re-found, wrapped in a <mark>, and any changed status is reported once.
const props = defineProps({
  content: { type: String, default: '' },
  highlights: { type: Array, default: () => [] },
  chapters: { type: Array, default: () => [] }, // the active book's chapters
  defaultChapterId: { type: String, default: '' },
  enabled: { type: Boolean, default: true }, // false for a PDF's read-only Text view
  // Declared as a prop (bound by @create) so the save can be awaited: it
  // resolves true on success, and the popover stays open on failure.
  onCreate: { type: Function, default: null }
});
const emit = defineEmits(['anchored', 'select-highlight']);

// html:false — rendered text only; no raw HTML reaches the DOM.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true });
// Sources come from arbitrary sites: never load their remote images (a tracking
// pixel / IP leak per page). Show the alt text instead; quotes are text anyway.
md.renderer.rules.image = (tokens, idx) => {
  const alt = tokens[idx].content;
  return alt ? `<span class="img-alt">[image: ${md.utils.escapeHtml(alt)}]</span>` : '';
};
const bodyEl = ref(null);
let textMap = null;

// The selection popover.
const popover = ref(null); // { top, left, start, end }
const popoverSeq = ref(0); // a fresh popover (empty draft) per selection
const saving = ref(false);

function render() {
  const el = bodyEl.value;
  if (!el) return;
  el.innerHTML = md.render(props.content || '');
  textMap = buildTextMap(el);
  const ranges = [];
  const updates = [];
  for (const h of props.highlights) {
    if (h.anchor_type !== 'text_quote') continue;
    const r = anchor(textMap.text, h);
    if (r.status !== h.anchor_status || (r.start !== undefined && r.start !== h.position_start)) {
      updates.push({ id: h.id, anchor_status: r.status, position_start: r.start ?? null, position_end: r.end ?? null });
    }
    if (r.status !== 'orphaned') ranges.push({ start: r.start, end: r.end, highlight: h });
  }
  applyMarks(textMap, ranges, (h) => {
    const m = document.createElement('mark');
    m.className = `hl hl-${h.color}`;
    m.dataset.hid = h.id;
    if (h.comment) m.title = h.comment;
    return m;
  });
  // Marks change the DOM; rebuild the map so new selections map correctly.
  textMap = buildTextMap(el);
  if (updates.length) emit('anchored', updates);
}

function onMouseUp() {
  if (!props.enabled) return;
  // Let the browser finish updating the selection first.
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyEl.value || !textMap) return;
    const range = sel.getRangeAt(0);
    if (!bodyEl.value.contains(range.commonAncestorContainer)) return;
    const offsets = rangeToOffsets(textMap, range);
    if (!offsets) return;
    popoverSeq.value++;
    const rect = range.getBoundingClientRect();
    const host = bodyEl.value.getBoundingClientRect();
    popover.value = {
      top: rect.bottom - host.top + 8,
      left: Math.max(0, Math.min(rect.left - host.left, host.width - 300)),
      ...offsets
    };
  }, 0);
}

function onClick(e) {
  const mark = e.target.closest?.('mark.hl');
  if (mark && window.getSelection()?.isCollapsed) emit('select-highlight', mark.dataset.hid);
}

async function save(fields) {
  if (!popover.value) return;
  saving.value = true;
  try {
    const sel = describe(textMap.text, popover.value.start, popover.value.end);
    if (await props.onCreate?.({ anchor_type: 'text_quote', ...sel, ...fields })) {
      popover.value = null;
      window.getSelection()?.removeAllRanges();
    }
  } finally {
    saving.value = false;
  }
}

function cancel() {
  popover.value = null;
}

// Scroll to and flash a highlight's mark (from the sidebar).
function reveal(id) {
  const mark = bodyEl.value?.querySelector(`mark[data-hid="${id}"]`);
  if (!mark) return false;
  mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  bodyEl.value.querySelectorAll(`mark[data-hid="${id}"]`).forEach(m => {
    m.classList.add('hl-flash');
    setTimeout(() => m.classList.remove('hl-flash'), 1200);
  });
  return true;
}
defineExpose({ reveal });

function onKey(e) {
  if (e.key === 'Escape') popover.value = null;
}

watch(() => [props.content, props.highlights], () => nextTick(render), { deep: true });
onMounted(() => {
  render();
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="hb">
    <article ref="bodyEl" class="source-body" @mouseup="onMouseUp" @click="onClick" />
    <HighlightPopover v-if="popover" :key="popoverSeq" :style="{ top: `${popover.top}px`, left: `${popover.left}px` }"
                      :chapters="chapters" :defaultChapterId="defaultChapterId" :saving="saving"
                      @save="save" @cancel="cancel" />
  </div>
</template>

<style scoped>
.hb { position: relative; }
.source-body { max-width: 820px; color: var(--text-primary); line-height: 1.65; font-size: 15px; }
.source-body :deep(a) { color: var(--accent-primary); }
.source-body :deep(blockquote) { border-left: 3px solid var(--border-strong); margin: 0; padding-left: 12px; color: var(--text-secondary); }
.source-body :deep(.img-alt) { color: var(--text-muted); font-size: 12px; }
.source-body :deep(mark.hl) { color: inherit; border-radius: 2px; cursor: pointer; padding: 0 1px; }
:deep(.hl-yellow) { background: rgba(250, 204, 21, 0.38); }
:deep(.hl-red) { background: rgba(248, 113, 113, 0.38); }
:deep(.hl-green) { background: rgba(74, 222, 128, 0.34); }
:deep(.hl-blue) { background: rgba(96, 165, 250, 0.38); }
.source-body :deep(mark.hl-flash) { outline: 2px solid var(--accent-primary); }
</style>
