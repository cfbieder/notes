<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { sapphireTheme, sapphireHighlight } from '../../lib/codemirror/sapphireTheme.js';
import { markdownRenderPlugin } from '../../lib/codemirror/markdownRendering.js';
import { wikilinkAutocomplete } from '../../lib/codemirror/wikilinkAutocomplete.js';
import { wikilinkRenderPlugin } from '../../lib/codemirror/wikilinkRendering.js';
import { tableKeymap } from '../../lib/codemirror/tableKeymap.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  sourceMode: { type: Boolean, default: false },
  format: { type: String, default: 'markdown' },
  noteTitles: { type: Array, default: () => [] },
  noteMap: { type: Map, default: () => new Map() },
  onNavigateToNote: { type: Function, default: null }
});

const emit = defineEmits(['update:modelValue', 'paste-image', 'edit-table']);

const editorContainer = ref(null);
let view = null;

function createState(doc) {
  const isHtml = props.format === 'html';

  const extensions = [
    keymap.of([...defaultKeymap, ...historyKeymap]),
    history(),
    drawSelection(),
    highlightActiveLine(),
    sapphireTheme,
    sapphireHighlight,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString());
      }
    }),
    EditorView.domEventHandlers({
      paste(event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const imageFiles = [];
        for (const item of items) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) imageFiles.push(file);
          }
        }
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        for (const file of imageFiles) emit('paste-image', file);
        return true;
      }
    })
  ];

  if (!isHtml) {
    // Markdown-only extensions: language, decorations, wikilinks, table keymap.
    extensions.push(
      tableKeymap,
      markdown({ base: markdownLanguage, codeLanguages: languages })
    );

    if (props.sourceMode) {
      // Source mode: line numbers, monospace, raw markdown
      extensions.push(lineNumbers());
    } else {
      // Normal mode: hide syntax, render inline
      extensions.push(markdownRenderPlugin);
      extensions.push(wikilinkRenderPlugin(
        () => props.noteMap,
        props.onNavigateToNote
      ));
    }

    extensions.push(wikilinkAutocomplete(() => props.noteTitles));
  } else {
    // HTML notes: plain-text source editing only. Line numbers help when
    // hand-editing markup.
    extensions.push(lineNumbers());
  }

  return EditorState.create({ doc, extensions });
}

function initEditor() {
  if (view) {
    view.destroy();
  }

  view = new EditorView({
    state: createState(props.modelValue),
    parent: editorContainer.value
  });
}

function onEditTableEvent(e) {
  const { from, to, text } = e.detail || {};
  emit('edit-table', { from, to, text });
}

onMounted(() => {
  initEditor();
  editorContainer.value?.addEventListener('noter-edit-table', onEditTableEvent);
});

onBeforeUnmount(() => {
  editorContainer.value?.removeEventListener('noter-edit-table', onEditTableEvent);
  if (view) {
    view.destroy();
    view = null;
  }
});

// Re-create editor when source mode or format toggles
watch([() => props.sourceMode, () => props.format], () => {
  if (view) {
    const content = view.state.doc.toString();
    initEditor();
    if (view.state.doc.toString() !== content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content }
      });
    }
  }
});

function replaceRange(from, to, text) {
  if (!view) return;
  const docLen = view.state.doc.length;
  const safeFrom = Math.max(0, Math.min(from, docLen));
  const safeTo = Math.max(safeFrom, Math.min(to, docLen));
  view.dispatch({
    changes: { from: safeFrom, to: safeTo, insert: text }
  });
}

function findRange(text) {
  if (!view) return null;
  const idx = view.state.doc.toString().indexOf(text);
  if (idx === -1) return null;
  return { from: idx, to: idx + text.length };
}

function insertAtCursor(text) {
  if (!view) return;
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  // Ensure table starts on its own line: prepend newline if current line is non-empty.
  const needsLeadingNl = line.text.length > 0 && sel.head !== line.from;
  const insert = (needsLeadingNl ? '\n' : '') + text + '\n';
  view.dispatch({
    changes: { from: sel.head, to: sel.head, insert },
    selection: { anchor: sel.head + insert.length }
  });
  view.focus();
}

defineExpose({ insertAtCursor, replaceRange, findRange });

// Update content when modelValue changes externally
watch(() => props.modelValue, (newVal) => {
  if (view && newVal !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newVal }
    });
  }
});
</script>

<template>
  <div
    ref="editorContainer"
    class="codemirror-wrapper"
    :class="{ 'source-mode': sourceMode }"
  />
</template>

<style scoped>
.codemirror-wrapper {
  flex: 1;
  overflow: hidden;
}

.codemirror-wrapper :deep(.cm-editor) {
  height: 100%;
}

.source-mode :deep(.cm-content) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
}
</style>
