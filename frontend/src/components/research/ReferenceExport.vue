<script setup>
import { ref } from 'vue';
import { ClipboardCopy, Download } from 'lucide-vue-next';
import { useResearchStore } from '../../stores/research.js';
import { useToastsStore } from '../../stores/toasts.js';

// CR039 Phase B — "Sources and Further Reading" export for a chapter or a whole
// book. Copy for Word puts HTML (italics survive the paste) and plain text on
// the clipboard; Download saves Markdown. Both come from one server response.
const props = defineProps({
  scope: { type: String, required: true }, // 'chapter' | 'book'
  id: { type: String, required: true },
  filename: { type: String, required: true }
});

const research = useResearchStore();
const toasts = useToastsStore();
const busy = ref(false);
// Phase C: add the "Key Passages" section (highlights grouped by source).
const withPassages = ref(false);
const include = () => (withPassages.value ? 'both' : 'sources');

function report(refs, verb) {
  const flagged = refs.incomplete ? ` — ${refs.incomplete} incomplete, marked [field?]` : '';
  const passages = withPassages.value ? ` and ${refs.passages} passage${refs.passages === 1 ? '' : 's'}` : '';
  toasts.addToast({
    message: `${verb} ${refs.count} reference${refs.count === 1 ? '' : 's'}${passages}${flagged}`,
    type: refs.incomplete ? 'warning' : 'success'
  });
}

async function copyForWord() {
  if (!window.ClipboardItem || !navigator.clipboard?.write) {
    toasts.addToast({ message: 'Copying needs a secure (HTTPS) page — use Download .md instead', type: 'error' });
    return;
  }
  busy.value = true;
  // Hand ClipboardItem promises rather than awaiting first, so Safari keeps the
  // click's user gesture across the fetch.
  const refsPromise = research.fetchReferences(props.scope, props.id, include());
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': refsPromise.then(r => new Blob([`<meta charset="utf-8">${r.html}`], { type: 'text/html' })),
      'text/plain': refsPromise.then(r => new Blob([r.text], { type: 'text/plain' }))
    })]);
    report(await refsPromise, 'Copied');
  } catch (err) {
    toasts.addToast({ message: err.message || 'Could not copy the references', type: 'error' });
  } finally {
    busy.value = false;
  }
}

async function downloadMd() {
  busy.value = true;
  try {
    const refs = await research.fetchReferences(props.scope, props.id, include());
    const url = URL.createObjectURL(new Blob([refs.markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.filename}.md`;
    a.click();
    URL.revokeObjectURL(url);
    report(refs, 'Downloaded');
  } catch (err) {
    toasts.addToast({ message: err.message || 'Could not export the references', type: 'error' });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="ref-export" role="group" :aria-label="scope === 'book' ? 'Export book references' : 'Export chapter references'">
    <button class="re-btn" :disabled="busy" title="Copy the reference list with formatting, ready to paste into Word" @click="copyForWord">
      <ClipboardCopy :size="14" /> Copy for Word
    </button>
    <button class="re-btn" :disabled="busy" title="Download the reference list as Markdown" @click="downloadMd">
      <Download :size="14" /> .md
    </button>
    <label class="re-check" title="Add a Key Passages section: your highlights, grouped by source">
      <input v-model="withPassages" type="checkbox" /> passages
    </label>
  </div>
</template>

<style scoped>
.ref-export { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 6px; overflow: hidden; }
.re-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; color: var(--text-primary); border: none;
  padding: 7px 11px; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.re-btn + .re-btn, .re-check { border-left: 1px solid var(--border-strong); }
.re-check { display: inline-flex; align-items: center; gap: 4px; padding: 0 10px; font-size: 12px; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.re-btn:hover:not(:disabled) { background: var(--hover-bg); }
.re-btn:disabled { opacity: 0.6; cursor: default; }
</style>
