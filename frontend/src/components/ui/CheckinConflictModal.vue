<script setup>
import { ref, computed, watch } from 'vue';
import { X, FileCheck, FileX, GitMerge } from 'lucide-vue-next';

const props = defineProps({
  open: { type: Boolean, default: false },
  noteId: { type: String, default: null },
  local: { type: Object, default: null }, // { title, content, notebookId, tags }
  server: { type: Object, default: null }  // full server note row
});
const emit = defineEmits(['close', 'keep-local', 'keep-server', 'merged']);

const mergeMode = ref(false);
const mergedContent = ref('');

watch(() => props.open, (v) => {
  if (v) {
    mergeMode.value = false;
    mergedContent.value = props.local?.content || '';
  }
});

const localTitle = computed(() => props.local?.title || '(untitled)');
const serverTitle = computed(() => props.server?.title || '(untitled)');
const localContent = computed(() => props.local?.content || '');
const serverContent = computed(() => props.server?.content || '');

// Tiny line-diff so the user can see *what* differs at a glance. Not a true
// 3-way merge — just colourises lines unique to each side.
function diffLines(a, b) {
  const aLines = (a || '').split('\n');
  const bLines = (b || '').split('\n');
  const bSet = new Set(bLines);
  const aSet = new Set(aLines);
  return {
    local: aLines.map(l => ({ text: l, status: bSet.has(l) ? 'same' : 'added' })),
    server: bLines.map(l => ({ text: l, status: aSet.has(l) ? 'same' : 'added' }))
  };
}

const diff = computed(() => diffLines(localContent.value, serverContent.value));

function onKeepLocal() { emit('keep-local'); }
function onKeepServer() { emit('keep-server'); }
function onStartMerge() { mergeMode.value = true; }
function onSaveMerged() { emit('merged', mergedContent.value); }
function onCancel() { emit('close'); }
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="conflict-overlay" @click.self="onCancel">
      <div class="conflict-modal">
        <div class="conflict-header">
          <h3>Sync conflict</h3>
          <p class="muted">
            <strong>{{ localTitle }}</strong> was changed on the server while you had an offline copy.
            Pick how to resolve.
          </p>
          <button class="icon-btn" @click="onCancel" aria-label="Close"><X :size="16" /></button>
        </div>

        <div class="conflict-body">
          <template v-if="!mergeMode">
            <div class="pane">
              <div class="pane-header local">Your offline copy</div>
              <div class="pane-body">
                <pre><span
                  v-for="(line, i) in diff.local"
                  :key="i"
                  :class="['line', line.status]"
                >{{ line.text }}
</span></pre>
              </div>
            </div>
            <div class="pane">
              <div class="pane-header server">Server version</div>
              <div class="pane-body">
                <pre><span
                  v-for="(line, i) in diff.server"
                  :key="i"
                  :class="['line', line.status]"
                >{{ line.text }}
</span></pre>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="pane">
              <div class="pane-header">Your merged version (editable)</div>
              <textarea
                v-model="mergedContent"
                class="merge-textarea"
                spellcheck="false"
              ></textarea>
            </div>
            <div class="pane">
              <div class="pane-header server">Server version (reference)</div>
              <div class="pane-body">
                <pre>{{ serverContent }}</pre>
              </div>
            </div>
          </template>
        </div>

        <div class="conflict-footer">
          <template v-if="!mergeMode">
            <button class="btn ghost" @click="onCancel">Cancel</button>
            <span class="spacer" />
            <button class="btn" @click="onKeepServer" title="Discard your offline edits, take the server version">
              <FileX :size="13" /> Keep server
            </button>
            <button class="btn" @click="onStartMerge" title="Hand-merge the two versions">
              <GitMerge :size="13" /> Hand-merge…
            </button>
            <button class="btn primary" @click="onKeepLocal" title="Overwrite the server with your local version">
              <FileCheck :size="13" /> Keep local
            </button>
          </template>
          <template v-else>
            <button class="btn ghost" @click="mergeMode = false">Back</button>
            <span class="spacer" />
            <button class="btn primary" @click="onSaveMerged">Save merged version</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.conflict-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2100;
}

.conflict-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: min(960px, 96vw);
  height: min(640px, 90vh);
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.conflict-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border-subtle);
  position: relative;
}

.conflict-header h3 {
  margin: 0 0 4px 0;
  font-size: 15px;
}

.conflict-header .muted {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.icon-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
}

.conflict-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border-subtle);
  overflow: hidden;
}

.pane {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  overflow: hidden;
}

.pane-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-subtle);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pane-header.local { color: var(--accent-primary); }
.pane-header.server { color: var(--text-secondary); }

.pane-body {
  flex: 1;
  overflow: auto;
  padding: 8px 12px;
}

.pane-body pre {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.line.added {
  background: var(--accent-warn-bg, rgba(255, 184, 0, 0.15));
  display: inline-block;
  width: 100%;
}

.merge-textarea {
  flex: 1;
  border: none;
  background: var(--bg-input);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  padding: 8px 12px;
  resize: none;
  outline: none;
}

.conflict-footer {
  padding: 12px 16px;
  display: flex;
  gap: 8px;
  align-items: center;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.spacer { flex: 1; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.btn:hover { background: var(--bg-hover); }
.btn.ghost { background: none; border-color: transparent; }
.btn.primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--on-accent-primary, #fff);
}
.btn.primary:hover {
  filter: brightness(1.05);
}
</style>
