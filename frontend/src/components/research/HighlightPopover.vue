<script setup>
import { ref, onMounted } from 'vue';
import { HIGHLIGHT_LEGEND } from '../../lib/citation.js';

// CR039 — the new-highlight popover (meaning, chapter, comment), shared by the
// text Reader (Phase C) and the PDF viewer (Phase D). The parent positions it
// and does the save; the last meaning picked is kept for the next highlight.
const props = defineProps({
  chapters: { type: Array, default: () => [] },
  defaultChapterId: { type: String, default: '' },
  saving: { type: Boolean, default: false }
});
const emit = defineEmits(['save', 'cancel']);

const draft = ref({ color: lastColor, chapterId: props.defaultChapterId || '', comment: '' });
const root = ref(null);

// Move focus in, so keyboard and screen-reader users land in the new dialog
// (in the PDF viewer it sits after every page in DOM order).
onMounted(() => root.value?.querySelector('.hb-color.on')?.focus({ preventScroll: true }));

function save() {
  lastColor = draft.value.color;
  emit('save', {
    color: draft.value.color,
    comment: draft.value.comment.trim() || null,
    chapter_ids: draft.value.chapterId ? [draft.value.chapterId] : []
  });
}
</script>

<script>
let lastColor = 'yellow';
</script>

<template>
  <div ref="root" class="hb-pop" role="dialog" aria-label="New highlight" @mousedown.stop @mouseup.stop>
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
      <button type="button" class="hb-btn" @click="emit('cancel')">Cancel</button>
      <button type="button" class="hb-btn hb-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Highlight' }}</button>
    </div>
  </div>
</template>

<style scoped>
.hb-pop {
  position: absolute; z-index: 20; width: 300px; padding: 10px;
  background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow-md);
  display: flex; flex-direction: column; gap: 8px;
}
.hb-colors { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.hb-color { border: 1px solid transparent; border-radius: 6px; padding: 5px 6px; font-size: 12px; color: var(--text-primary); cursor: pointer; }
.hb-color.on { border-color: var(--text-primary); font-weight: 600; }
.hb-color:focus-visible, .hb-btn:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }
.hl-yellow { background: rgba(250, 204, 21, 0.38); }
.hl-red { background: rgba(248, 113, 113, 0.38); }
.hl-green { background: rgba(74, 222, 128, 0.34); }
.hl-blue { background: rgba(96, 165, 250, 0.38); }
.hb-input {
  background: var(--bg-main); color: var(--text-primary); border: 1px solid var(--border-strong);
  border-radius: 6px; padding: 6px 8px; font: inherit; font-size: 13px; resize: vertical;
}
.hb-actions { display: flex; justify-content: flex-end; gap: 6px; }
.hb-btn { background: transparent; color: var(--text-primary); border: 1px solid var(--border-strong); border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer; }
.hb-primary { background: var(--accent-primary); border-color: var(--accent-primary); color: #fff; }
.hb-btn:disabled { opacity: 0.6; }
</style>
