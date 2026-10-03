<script setup>
import { Highlighter } from 'lucide-vue-next';
import { HIGHLIGHT_LEGEND } from '../../lib/citation.js';

// CR039 §10.4 — highlights as their own search result type. Quotes and
// comments are user/web text: rendered with {{ }} only, never v-html.
defineProps({ results: { type: Array, required: true } });
const emit = defineEmits(['open']);
const labelOf = (c) => HIGHLIGHT_LEGEND.find(l => l.color === c)?.label || c;
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n)}…` : s);
</script>

<template>
  <section class="sh" aria-label="Highlight matches">
    <h3 class="sh-title"><Highlighter :size="14" /> Highlights <span class="sh-count">{{ results.length }}</span></h3>
    <button v-for="h in results" :key="h.id" class="sh-item" :class="`sh-${h.color}`" @click="emit('open', h)">
      <span class="sh-quote">“{{ clip(h.exact, 220) }}”</span>
      <span v-if="h.comment" class="sh-comment">{{ clip(h.comment, 160) }}</span>
      <span class="sh-meta">{{ labelOf(h.color) }} · {{ h.source_title }}<template v-if="h.anchor_status === 'orphaned'"> · unanchored</template></span>
    </button>
  </section>
</template>

<style scoped>
.sh { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.sh-title { display: flex; align-items: center; gap: 6px; margin: 0 0 2px; font-size: 13px; color: var(--text-secondary); }
.sh-count { color: var(--text-muted); font-weight: 400; }
.sh-item {
  display: flex; flex-direction: column; gap: 3px; text-align: left; cursor: pointer;
  background: var(--bg-card); border: 1px solid var(--border-subtle); border-left: 3px solid; border-radius: 6px; padding: 8px 10px; color: var(--text-primary);
}
.sh-item:hover { border-color: var(--accent-primary); }
.sh-yellow { border-left-color: rgb(250, 204, 21); }
.sh-red { border-left-color: rgb(248, 113, 113); }
.sh-green { border-left-color: rgb(74, 222, 128); }
.sh-blue { border-left-color: rgb(96, 165, 250); }
.sh-quote { font-size: 14px; }
.sh-comment { font-size: 13px; color: var(--text-secondary); }
.sh-meta { font-size: 11px; color: var(--text-muted); }
</style>
