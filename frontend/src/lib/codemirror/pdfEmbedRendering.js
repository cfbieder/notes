import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

class PdfEmbedWidget extends WidgetType {
  constructor(attachmentId, filename) {
    super();
    this.attachmentId = attachmentId;
    this.filename = filename;
  }

  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-pdf-embed';
    const iframe = document.createElement('iframe');
    // Auth rides on the HttpOnly attachment cookie (CR009) — iframes can't send
    // an Authorization header, and a token in the URL would leak it.
    // #toolbar/navpanes/scrollbar hash params are PDF Open Parameters honoured
    // by Chrome's built-in viewer (and most others) — they hide the embedded
    // viewer chrome so the page renders flush against the editor.
    iframe.src = `/api/v1/attachments/${this.attachmentId}#toolbar=0&navpanes=0&scrollbar=0`;
    iframe.title = this.filename;
    iframe.loading = 'lazy';
    wrap.appendChild(iframe);
    return wrap;
  }

  eq(other) {
    return this.attachmentId === other.attachmentId && this.filename === other.filename;
  }

  ignoreEvent() {
    return true;
  }
}

class BrokenEmbedWidget extends WidgetType {
  constructor(name) {
    super();
    this.name = name;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-embed-broken';
    span.textContent = `![[${this.name}]]`;
    span.title = `Attachment "${this.name}" not found`;
    return span;
  }

  eq(other) {
    return other.name === this.name;
  }
}

const EMBED_REGEX = /!\[\[([^\]]+)\]\]/g;

function buildDecorations(view, getAttachmentMap) {
  const builder = new RangeSetBuilder();
  const doc = view.state.doc;
  const cursorLine = doc.lineAt(view.state.selection.main.head).number;
  const attachmentMap = getAttachmentMap() || new Map();

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to);
    let match;
    EMBED_REGEX.lastIndex = 0;

    while ((match = EMBED_REGEX.exec(text)) !== null) {
      const matchFrom = from + match.index;
      const matchTo = matchFrom + match[0].length;
      const matchLine = doc.lineAt(matchFrom).number;
      if (matchLine === cursorLine) continue;

      const name = match[1].trim();
      const att = attachmentMap.get(name.toLowerCase());

      if (att && att.mime_type === 'application/pdf') {
        builder.add(matchFrom, matchTo, Decoration.replace({
          widget: new PdfEmbedWidget(att.id, name)
        }));
      } else if (!att) {
        builder.add(matchFrom, matchTo, Decoration.replace({
          widget: new BrokenEmbedWidget(name)
        }));
      }
      // Non-PDF attachments: leave raw text (no embed renderer yet).
    }
  }

  return builder.finish();
}

export function pdfEmbedRenderPlugin(getAttachmentMap) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(view, getAttachmentMap);
      }

      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, getAttachmentMap);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: () => []
    }
  );
}
