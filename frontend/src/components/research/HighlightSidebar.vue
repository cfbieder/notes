<script setup>
import { ref, computed } from 'vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import ConfirmModal from '../ui/ConfirmModal.vue';
import { HIGHLIGHT_LEGEND } from '../../lib/citation.js';

// CR039 Phase C — the highlights of one source: quote, meaning, comment,
// chapters. Orphaned highlights (no longer placeable) sit at the bottom but are
// kept and exported (D8). Quotes and comments are rendered as text only.
const props = defineProps({
  highlights: { type: Array, default: () => [] },
  chapters: { type: Array, default: () => [] }
});
const emit = defineEmits(['update', 'delete', 'reveal']);

const labelOf = (color) => HIGHLIGHT_LEGEND.find(l => l.color === color)?.label || color;
const ordered = computed(() => [
  ...props.highlights.filter(h => h.anchor_status !== 'orphaned'),
  ...props.highlights.filter(h => h.anchor_status === 'orphaned')
]);

const editingId = ref(null);
const draft = ref({ color: 'yellow', chapterId: '', comment: '' });
const confirmDelete = ref(null);

function startEdit(h) {
  editingId.value = h.id;
  draft.value = { color: h.color, chapterId: h.chapters[0]?.id || '', comment: h.comment || '' };
}

function saveEdit(h) {
  emit('update', h.id, {
    color: draft.value.color,
    comment: draft.value.comment.trim() || null,
    chapter_ids: draft.value.chapterId ? [draft.value.chapterId] : []
  });
  editingId.value = null;
}

function quote(h) {
  return h.exact.length > 280 ? `${h.exact.slice(0, 280)}…` : h.exact;
}
</script>

<template>
  <aside class="hs" aria-label="Highlights">
    <h4 class="hs-title">Highlights <span class="hs-count">{{ highlights.length }}</span></h4>
    <p v-if="!highlights.length" class="hs-empty">Select text in the source to highlight it.</p>
    <ul class="hs-list">
      <li v-for="h in ordered" :key="h.id" class="hs-item" :class="`hs-${h.color}`">
        <template v-if="editingId === h.id">
          <form class="hs-edit" @submit.prevent="saveEdit(h)" @keydown.esc="editingId = null">
            <select v-model="draft.color" class="hs-input" aria-label="Meaning">
              <option v-for="l in HIGHLIGHT_LEGEND" :key="l.color" :value="l.color">{{ l.label }}</option>
            </select>
            <select v-if="chapters.length" v-model="draft.chapterId" class="hs-input" aria-label="Chapter">
              <option value="">No chapter</option>
              <option v-for="c in chapters" :key="c.id" :value="c.id">{{ c.label }} · {{ c.title }}</option>
            </select>
            <textarea v-model="draft.comment" class="hs-input" rows="2" aria-label="Comment" placeholder="Comment" />
            <div class="hs-actions">
              <button type="button" class="hs-btn" @click="editingId = null">Cancel</button>
              <button type="submit" class="hs-btn hs-primary">Save</button>
            </div>
          </form>
        </template>
        <template v-else>
          <div class="hs-head">
            <span class="hs-label">{{ labelOf(h.color) }}</span>
            <span v-if="h.anchor_status === 'orphaned'" class="hs-badge" title="The quote is no longer in the source text; it is kept and still exported">unanchored</span>
            <span v-else-if="h.anchor_status === 'fuzzy'" class="hs-badge hs-fuzzy" title="Placed by an approximate match — the source text changed slightly">approx.</span>
            <span class="hs-spacer" />
            <button class="hs-icon" :aria-label="`Edit highlight`" title="Edit" @click="startEdit(h)"><Pencil :size="13" /></button>
            <button class="hs-icon" :aria-label="`Delete highlight`" title="Delete" @click="confirmDelete = h"><Trash2 :size="13" /></button>
          </div>
          <button class="hs-quote" :disabled="h.anchor_status === 'orphaned'" title="Show in the text" @click="emit('reveal', h.id)">
            “{{ quote(h) }}”
          </button>
          <p v-if="h.comment" class="hs-comment">{{ h.comment }}</p>
          <div v-if="h.chapters.length" class="hs-chapters">
            <span v-for="c in h.chapters" :key="c.id" class="hs-chip">{{ c.label }} · {{ c.title }}</span>
          </div>
        </template>
      </li>
    </ul>
    <ConfirmModal
      v-if="confirmDelete"
      title="Delete highlight?"
      :message="`Delete this highlight${confirmDelete.comment ? ' and its comment' : ''}? The source text is not changed.`"
      confirmText="Delete"
      danger
      @confirm="emit('delete', confirmDelete.id); confirmDelete = null"
      @cancel="confirmDelete = null"
    />
  </aside>
</template>

<style scoped>
.hs { font-size: 13px; }
.hs-title { margin: 0 0 8px; font-size: 13px; color: var(--text-secondary); font-weight: 600; }
.hs-count { color: var(--text-muted); font-weight: 400; }
.hs-empty { color: var(--text-muted); font-size: 12px; margin: 0; }
.hs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.hs-item { border-left: 3px solid; padding: 6px 8px; background: var(--bg-card); border-radius: 4px; }
.hs-yellow { border-left-color: rgb(250, 204, 21); }
.hs-red { border-left-color: rgb(248, 113, 113); }
.hs-green { border-left-color: rgb(74, 222, 128); }
.hs-blue { border-left-color: rgb(96, 165, 250); }
.hs-head { display: flex; align-items: center; gap: 6px; }
.hs-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.hs-badge { font-size: 10px; border-radius: 999px; padding: 0 6px; background: var(--status-error-bg); color: var(--status-error); }
.hs-fuzzy { background: var(--status-warning-bg); color: var(--status-warning); }
.hs-spacer { flex: 1; }
.hs-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: inline-flex; }
.hs-icon:hover { color: var(--text-primary); }
.hs-quote { display: block; text-align: left; background: none; border: none; padding: 2px 0; color: var(--text-primary); font: inherit; cursor: pointer; }
.hs-quote:disabled { cursor: default; opacity: 0.8; }
.hs-comment { margin: 4px 0 0; color: var(--text-secondary); white-space: pre-wrap; }
.hs-chapters { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.hs-chip { font-size: 11px; background: var(--rail-active); border-radius: 999px; padding: 1px 7px; }
.hs-edit { display: flex; flex-direction: column; gap: 6px; }
.hs-input { background: var(--bg-main); color: var(--text-primary); border: 1px solid var(--border-strong); border-radius: 6px; padding: 5px 7px; font: inherit; font-size: 12px; }
.hs-actions { display: flex; justify-content: flex-end; gap: 6px; }
.hs-btn { background: transparent; color: var(--text-primary); border: 1px solid var(--border-strong); border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.hs-primary { background: var(--accent-primary); border-color: var(--accent-primary); color: #fff; }
</style>
