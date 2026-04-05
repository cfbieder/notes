import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';

// Widget for rendering checkboxes
class CheckboxWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }

  toDOM() {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this.checked;
    cb.classList.add('cm-checkbox');
    cb.style.cssText = 'margin: 0 6px 0 0; vertical-align: middle; accent-color: #4cc9f0; cursor: pointer;';
    return cb;
  }

  eq(other) {
    return this.checked === other.checked;
  }
}

// Hide markdown syntax markers in normal mode
function buildDecorations(view) {
  const builder = new RangeSetBuilder();
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter(node) {
        // Hide heading markers: # ## ### etc.
        if (node.name === 'HeaderMark') {
          // Hide the # marks and trailing space
          const end = Math.min(node.to + 1, doc.length);
          builder.add(node.from, end, Decoration.replace({}));
        }

        // Hide emphasis markers: * _ ** __
        if (node.name === 'EmphasisMark' || node.name === 'StrongEmphasisMark') {
          builder.add(node.from, node.to, Decoration.replace({}));
        }

        // Hide code markers: `
        if (node.name === 'CodeMark' && node.to - node.from <= 1) {
          builder.add(node.from, node.to, Decoration.replace({}));
        }

        // Hide strikethrough markers: ~~
        if (node.name === 'StrikethroughMark') {
          builder.add(node.from, node.to, Decoration.replace({}));
        }

        // Replace task list markers with checkboxes
        if (node.name === 'TaskMarker') {
          const text = doc.sliceString(node.from, node.to);
          const checked = text.includes('x') || text.includes('X');
          builder.add(node.from, node.to, Decoration.replace({
            widget: new CheckboxWidget(checked)
          }));
        }

        // Style horizontal rules
        if (node.name === 'HorizontalRule') {
          builder.add(node.from, node.from, Decoration.line({
            class: 'cm-hr-line'
          }));
        }

        // Style blockquotes
        if (node.name === 'Blockquote') {
          // Add line decoration for blockquote styling
          const line = doc.lineAt(node.from);
          builder.add(line.from, line.from, Decoration.line({
            class: 'cm-blockquote-line'
          }));
        }

        // Hide blockquote markers: >
        if (node.name === 'QuoteMark') {
          builder.add(node.from, Math.min(node.to + 1, doc.length), Decoration.replace({}));
        }

        // Style list markers as bullets
        if (node.name === 'ListMark') {
          const text = doc.sliceString(node.from, node.to).trim();
          if (text === '-' || text === '*' || text === '+') {
            builder.add(node.from, node.to, Decoration.replace({
              widget: new BulletWidget()
            }));
          }
        }
      }
    });
  }

  return builder.finish();
}

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.textContent = '\u2022';
    span.style.cssText = 'color: #ff9f1c; font-weight: bold; margin-right: 4px;';
    return span;
  }

  eq() { return true; }
}

export const markdownRenderPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: () => []
  }
);
