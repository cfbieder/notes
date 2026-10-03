<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';
import { anchor, describe } from '../../lib/anchoring.js';
import { buildTextMap, rangeToOffsets, applyMarks } from '../../lib/highlightDom.js';
import { HIGHLIGHT_LEGEND } from '../../lib/citation.js';

// CR039 Phase C — the source body with its highlights. Anchoring runs here, in
// the browser, against the text actually rendered (§16 #13): each highlight is
// re-found, wrapped in a <mark>, and any changed status is reported once.
const props = defineProps({
  content: { type: String, default: '' },
  highlights: { type: Array, default: () => [] },
  chapters: { type: Array, default: () => [] }, // the active book's chapters
  defaultChapterId: { type: String, default: '' },
  enabled: { type: Boolean, default: true } // false for PDF sources (Phase D)
});
const emit = defineEmits(['create', 'anchored', 'select-highlight']);

// html:false — rendered text only; no raw HTML reaches the DOM.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true });
const bodyEl = ref(null);
let textMap = null;

// The selection popover.
const popover = ref(null); // { top, left, start, end }
const draft = ref({ color: 'yellow', chapterId: '', comment: '' });
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
    const rect = range.getBoundingClientRect();
    const host = bodyEl.value.getBoundingClientRect();
    popover.value = {
      top: rect.bottom - host.top + 8,
      left: Math.max(0, Math.min(rect.left - host.left, host.width - 300)),
      ...offsets
    };
    draft.value = { color: draft.value.color, chapterId: props.defaultChapterId || '', comment: '' };
  }, 0);
}

function onClick(e) {
  const mark = e.target.closest?.('mark.hl');
  if (mark && window.getSelection()?.isCollapsed) emit('select-highlight', mark.dataset.hid);
}

async function save() {
  if (!popover.value) return;
  saving.value = true;
  try {
    const sel = describe(textMap.text, popover.value.start, popover.value.end);
    await emit('create', {
      anchor_type: 'text_quote',
      ...sel,
      color: draft.value.color,
      comment: draft.value.comment.trim() || null,
      chapter_ids: draft.value.chapterId ? [draft.value.chapterId] : []
    });
    popover.value = null;
    window.getSelection()?.removeAllRanges();
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
    <div v-if="popover" class="hb-pop" :style="{ top: `${popover.top}px`, left: `${popover.left}px` }"
         role="dialog" aria-label="New highlight" @mousedown.stop @mouseup.stop>
      <div class="hb-colors" role="radiogroup" aria-label="Highlight meaning">
        <button v-for="l in HIGHLIGHT_LEGEND" :key="l.color" type="button" role="radio"
                :aria-checked="draft.color === l.color" :class="['hb-color', `hl-${l.color}`, { on: draft.color === l.color }]"
                @click="draft.color = l.color">{{ l.label }}</button>
      </div>
      <select v-if="chapters.length" v-model="draft.chapterId" class="hb-input" aria-label="Chapter">
        <option value="">No chapter</option>
        <option v-for="c in chapters" :key="c.id" :value="c.id">{{ c.label }} · {{ c.title }}</option>
      </select>
      <textarea v-model="draft.comment" class="hb-input" rows="2" placeholder="Comment (optional)" aria-label="Comment" />
      <div class="hb-actions">
        <button type="button" class="hb-btn" @click="cancel">Cancel</button>
        <button type="button" class="hb-btn hb-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Highlight' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hb { position: relative; }
.source-body { max-width: 820px; color: var(--text-primary); line-height: 1.65; font-size: 15px; }
.source-body :deep(a) { color: var(--accent-primary); }
.source-body :deep(blockquote) { border-left: 3px solid var(--border-strong); margin: 0; padding-left: 12px; color: var(--text-secondary); }
.source-body :deep(mark.hl) { color: inherit; border-radius: 2px; cursor: pointer; padding: 0 1px; }
:deep(.hl-yellow) { background: rgba(250, 204, 21, 0.38); }
:deep(.hl-red) { background: rgba(248, 113, 113, 0.38); }
:deep(.hl-green) { background: rgba(74, 222, 128, 0.34); }
:deep(.hl-blue) { background: rgba(96, 165, 250, 0.38); }
.source-body :deep(mark.hl-flash) { outline: 2px solid var(--accent-primary); }
.hb-pop {
  position: absolute; z-index: 20; width: 300px; padding: 10px;
  background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow-md);
  display: flex; flex-direction: column; gap: 8px;
}
.hb-colors { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.hb-color { border: 1px solid transparent; border-radius: 6px; padding: 5px 6px; font-size: 12px; color: var(--text-primary); cursor: pointer; }
.hb-color.on { border-color: var(--text-primary); font-weight: 600; }
.hb-input {
  background: var(--bg-main); color: var(--text-primary); border: 1px solid var(--border-strong);
  border-radius: 6px; padding: 6px 8px; font: inherit; font-size: 13px; resize: vertical;
}
.hb-actions { display: flex; justify-content: flex-end; gap: 6px; }
.hb-btn { background: transparent; color: var(--text-primary); border: 1px solid var(--border-strong); border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer; }
.hb-primary { background: var(--accent-primary); border-color: var(--accent-primary); color: #fff; }
.hb-btn:disabled { opacity: 0.6; }
</style>
