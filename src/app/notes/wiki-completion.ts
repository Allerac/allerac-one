import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { getWikiQuery, matchTitles } from './wiki-links';

/**
 * CodeMirror completion source for [[Page]] links. Picking a title inserts
 * `Title]]`, reusing an existing `]]` right after the cursor.
 */
export function wikiCompletionSource(getTitles: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const q = getWikiQuery(line.text, context.pos - line.from);
    if (!q) return null;
    const from = line.from + q.start;
    const titles = matchTitles(getTitles(), q.query, 20);
    if (titles.length === 0) return null;
    const options: Completion[] = titles.map(title => ({
      label: title,
      type: 'text',
      apply: (view, _completion, applyFrom, applyTo) => {
        const after = view.state.sliceDoc(applyTo, applyTo + 2);
        const to = after === ']]' ? applyTo + 2 : applyTo;
        const insert = `${title}]]`;
        view.dispatch({
          changes: { from: applyFrom, to, insert },
          selection: { anchor: applyFrom + insert.length },
          userEvent: 'input.complete',
        });
      },
    }));
    return { from, options, filter: false };
  };
}
