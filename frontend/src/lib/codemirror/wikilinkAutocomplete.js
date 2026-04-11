import { autocompletion } from '@codemirror/autocomplete';

function wikilinkCompletionSource(getNoteTitles) {
  return (context) => {
    // Look backwards for [[ without a closing ]]
    const line = context.state.doc.lineAt(context.pos);
    const textBefore = line.text.slice(0, context.pos - line.from);

    const openBracket = textBefore.lastIndexOf('[[');
    if (openBracket === -1) return null;

    // Check there's no closing ]] between [[ and cursor
    const afterOpen = textBefore.slice(openBracket + 2);
    if (afterOpen.includes(']]')) return null;

    const query = afterOpen.toLowerCase();
    const from = line.from + openBracket + 2;

    const titles = getNoteTitles();
    const options = titles
      .filter(t => t.toLowerCase().includes(query))
      .slice(0, 20)
      .map(title => ({
        label: title,
        apply: title + ']]',
        type: 'text'
      }));

    if (options.length === 0) return null;

    return {
      from,
      options,
      filter: false
    };
  };
}

export function wikilinkAutocomplete(getNoteTitles) {
  return autocompletion({
    override: [wikilinkCompletionSource(getNoteTitles)],
    defaultKeymap: true
  });
}
