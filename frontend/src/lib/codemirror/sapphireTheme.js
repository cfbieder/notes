import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const sapphireTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#ffffff',
    fontFamily: "'Inter', sans-serif",
    fontSize: '15px',
    height: '100%'
  },
  '.cm-content': {
    caretColor: '#ff9f1c',
    padding: '16px 0',
    minHeight: '100%'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#ff9f1c',
    borderLeftWidth: '2px'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(58, 134, 255, 0.06)'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(58, 134, 255, 0.25)'
  },
  '.cm-gutters': {
    backgroundColor: '#102a50',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#6b8dbb'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(58, 134, 255, 0.1)'
  },
  '.cm-scroller': {
    overflow: 'auto'
  },
  '.cm-focused': {
    outline: 'none'
  }
});

export const sapphireHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.heading1, color: '#ffffff', fontWeight: '700', fontSize: '1.6em' },
  { tag: tags.heading2, color: '#ffffff', fontWeight: '600', fontSize: '1.35em' },
  { tag: tags.heading3, color: '#ffffff', fontWeight: '600', fontSize: '1.15em' },
  { tag: tags.heading4, color: '#c4d9ff', fontWeight: '600' },
  { tag: tags.heading5, color: '#c4d9ff', fontWeight: '500' },
  { tag: tags.heading6, color: '#c4d9ff', fontWeight: '500' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#c4d9ff' },
  { tag: tags.strong, fontWeight: '700', color: '#ffffff' },
  { tag: tags.link, color: '#3a86ff' },
  { tag: tags.url, color: '#3a86ff', textDecoration: 'underline' },
  { tag: tags.monospace, fontFamily: "'JetBrains Mono', monospace", color: '#4cc9f0' },
  { tag: tags.comment, color: '#6b8dbb', fontStyle: 'italic' },
  { tag: tags.meta, color: '#6b8dbb' },
  { tag: tags.quote, color: '#c4d9ff', fontStyle: 'italic' },
  { tag: tags.list, color: '#ff9f1c' },
  { tag: tags.processingInstruction, color: '#4cc9f0' }
]));
