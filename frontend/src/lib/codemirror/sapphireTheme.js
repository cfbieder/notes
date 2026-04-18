import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/*
 * Editor theme. Kept named "sapphire*" for backward-compatibility with
 * existing imports, but all colors flow through CSS custom properties, so
 * the editor adapts to whichever theme (sapphire/dark/light) is active on
 * <html data-theme="...">.
 */

export const sapphireTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: "'Inter', sans-serif",
    fontSize: '15px',
    height: '100%'
  },
  '.cm-content': {
    caretColor: 'var(--accent-warn)',
    padding: '16px 0',
    minHeight: '100%'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent-warn)',
    borderLeftWidth: '2px'
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--hover-bg)'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--selection-bg)'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--hover-bg)'
  },
  '.cm-scroller': {
    overflow: 'auto'
  },
  '.cm-focused': {
    outline: 'none'
  },
  /* Normal mode rendering styles */
  '.cm-hr-line': {
    borderBottom: '1px solid var(--border-subtle)',
    paddingBottom: '8px',
    marginBottom: '8px'
  },
  '.cm-blockquote-line': {
    borderLeft: '3px solid var(--accent-primary)',
    paddingLeft: '12px',
    fontStyle: 'italic',
    color: 'var(--text-secondary)'
  },
  /* Wikilink styles */
  '.cm-wikilink': {
    color: 'var(--accent-primary)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-subtle)',
    transition: 'border-color 0.15s'
  },
  '.cm-wikilink:hover': {
    borderBottomColor: 'var(--accent-primary)'
  },
  '.cm-wikilink-broken': {
    color: 'var(--status-error)',
    borderBottom: '1px dashed var(--status-error)',
    cursor: 'pointer'
  },
  '.cm-wikilink-broken:hover': {
    borderBottomColor: 'var(--status-error)'
  },
  /* Autocomplete tooltip */
  '.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  '.cm-tooltip-autocomplete > ul > li': {
    color: 'var(--text-secondary)',
    padding: '4px 12px'
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--selection-bg)',
    color: 'var(--text-primary)'
  }
});

export const sapphireHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--text-primary)', fontWeight: '700', fontSize: '1.6em' },
  { tag: tags.heading2, color: 'var(--text-primary)', fontWeight: '600', fontSize: '1.35em' },
  { tag: tags.heading3, color: 'var(--text-primary)', fontWeight: '600', fontSize: '1.15em' },
  { tag: tags.heading4, color: 'var(--text-secondary)', fontWeight: '600' },
  { tag: tags.heading5, color: 'var(--text-secondary)', fontWeight: '500' },
  { tag: tags.heading6, color: 'var(--text-secondary)', fontWeight: '500' },
  { tag: tags.emphasis, fontStyle: 'italic', color: 'var(--text-secondary)' },
  { tag: tags.strong, fontWeight: '700', color: 'var(--text-primary)' },
  { tag: tags.link, color: 'var(--accent-primary)' },
  { tag: tags.url, color: 'var(--accent-primary)', textDecoration: 'underline' },
  { tag: tags.monospace, fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-success)' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: tags.meta, color: 'var(--text-muted)' },
  { tag: tags.quote, color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--accent-warn)' },
  { tag: tags.processingInstruction, color: 'var(--accent-success)' }
]));
