import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

class WikilinkWidget extends WidgetType {
  constructor(title, displayText, noteId, isBroken, onNavigate) {
    super();
    this.title = title;
    this.displayText = displayText;
    this.noteId = noteId;
    this.isBroken = isBroken;
    this.onNavigate = onNavigate;
  }

  toDOM() {
    const span = document.createElement('span');
    span.textContent = this.displayText;
    span.className = this.isBroken ? 'cm-wikilink cm-wikilink-broken' : 'cm-wikilink';
    span.title = this.isBroken ? `${this.title} (not found)` : this.title;

    if (this.noteId && this.onNavigate) {
      span.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.onNavigate(this.noteId);
      });
    }

    return span;
  }

  eq(other) {
    return this.title === other.title &&
      this.noteId === other.noteId &&
      this.isBroken === other.isBroken;
  }

  ignoreEvent() {
    return false;
  }
}

// Negative lookbehind excludes `![[…]]` embeds — those are handled by pdfEmbedRendering.js.
const WIKILINK_REGEX = /(?<!!)\[\[([^\]]+)\]\]/g;

function buildWikilinkDecorations(view, getNoteMap, onNavigate) {
  const builder = new RangeSetBuilder();
  const doc = view.state.doc;
  const cursorLine = doc.lineAt(view.state.selection.main.head).number;
  const noteMap = getNoteMap();

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to);
    let match;
    WIKILINK_REGEX.lastIndex = 0;

    while ((match = WIKILINK_REGEX.exec(text)) !== null) {
      const matchFrom = from + match.index;
      const matchTo = matchFrom + match[0].length;
      const inner = match[1];

      const matchLine = doc.lineAt(matchFrom).number;
      if (matchLine === cursorLine) continue;

      const pipeIndex = inner.indexOf('|');
      const title = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : inner.trim();
      const displayText = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : inner.trim();

      const entry = noteMap.get(title.toLowerCase());
      const noteId = entry?.id || null;
      const isBroken = !entry || entry.deleted_at != null;

      builder.add(matchFrom, matchTo, Decoration.replace({
        widget: new WikilinkWidget(title, displayText, noteId, isBroken, onNavigate)
      }));
    }
  }

  return builder.finish();
}

export function wikilinkRenderPlugin(getNoteMap, onNavigate) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildWikilinkDecorations(view, getNoteMap, onNavigate);
      }

      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildWikilinkDecorations(update.view, getNoteMap, onNavigate);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: () => []
    }
  );
}
