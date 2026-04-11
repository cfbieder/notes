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

const props = defineProps({
  modelValue: { type: String, default: '' },
  sourceMode: { type: Boolean, default: false },
  noteTitles: { type: Array, default: () => [] },
  noteMap: { type: Map, default: () => new Map() },
  onNavigateToNote: { type: Function, default: null }
});

const emit = defineEmits(['update:modelValue']);

const editorContainer = ref(null);
let view = null;

function createState(doc) {
  const extensions = [
    keymap.of([...defaultKeymap, ...historyKeymap]),
    history(),
    drawSelection(),
    highlightActiveLine(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    sapphireTheme,
    sapphireHighlight,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString());
      }
    })
  ];

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

  // Wikilink autocomplete works in both modes
  extensions.push(wikilinkAutocomplete(() => props.noteTitles));

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

onMounted(() => {
  initEditor();
});

onBeforeUnmount(() => {
  if (view) {
    view.destroy();
    view = null;
  }
});

// Re-create editor when source mode toggles
watch(() => props.sourceMode, () => {
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
