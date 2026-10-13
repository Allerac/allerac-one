import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CompletionContext } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { wikiCompletionSource } from '@/app/notes/wiki-completion';
import { wikiLinkAt } from '@/app/notes/wiki-links';
import { detectLineSeparator } from '@/app/notes/editor-text';

function stateFor(doc: string) {
  const sep = detectLineSeparator(doc);
  return EditorState.create({ doc, extensions: [markdown(), ...(sep ? [EditorState.lineSeparator.of(sep)] : [])] });
}

describe('CodeMirror markdown editor', () => {
  it.each([
    ['plain markdown', '# Title\n\n- [ ] task\n\n```ts\nconst x = 1;\n```\n\n| a | b |\n|---|---|\n'],
    ['trailing whitespace and blank lines', 'line with spaces   \n\n\n\ttabbed\n'],
    ['unicode and wiki links', 'Café ☕ [[Página Ñ|alias]] 😀\n'],
    ['CRLF content', 'a\r\nb\r\n\r\nc'],
    ['empty', ''],
  ])('round-trips %s losslessly', (_label, doc) => {
    expect(stateFor(doc).sliceDoc()).toBe(doc);
  });

  it('keeps LF when CRLF is not dominant', () => {
    expect(detectLineSeparator('a\nb\nc\r\n')).toBeUndefined();
    expect(detectLineSeparator('a\r\nb')).toBe('\r\n');
    expect(detectLineSeparator('a\nb')).toBeUndefined();
  });

  it('offers [[ completions and inserts the closing brackets', () => {
    const doc = 'See [[Ro';
    const state = stateFor(doc);
    const source = wikiCompletionSource(() => ['Roadmap', 'Ideas', 'Old roadmap']);
    const result = source(new CompletionContext(state, doc.length, true));
    expect(result?.from).toBe(6);
    expect(result?.options.map(o => o.label)).toEqual(['Roadmap', 'Old roadmap']);

    const parent = document.createElement('div');
    const view = new EditorView({ state, parent });
    const apply = result!.options[0].apply as (v: EditorView, c: unknown, from: number, to: number) => void;
    apply(view, result!.options[0], result!.from, doc.length);
    expect(view.state.doc.toString()).toBe('See [[Roadmap]]');
    expect(view.state.selection.main.head).toBe('See [[Roadmap]]'.length);
    view.destroy();
  });

  it('reuses an existing closing ]] when completing', () => {
    const doc = 'x [[Ro]] y';
    const state = stateFor(doc);
    const result = wikiCompletionSource(() => ['Roadmap'])(new CompletionContext(state, 6, true))!;
    const view = new EditorView({ state, parent: document.createElement('div') });
    (result.options[0].apply as (v: EditorView, c: unknown, f: number, t: number) => void)(view, result.options[0], result.from, 6);
    expect(view.state.doc.toString()).toBe('x [[Roadmap]] y');
    view.destroy();
  });

  it('returns no completions outside a [[ query', () => {
    const state = stateFor('plain text');
    expect(wikiCompletionSource(() => ['A'])(new CompletionContext(state, 5, true))).toBeNull();
  });

  it('finds the wiki link under the cursor', () => {
    const text = 'a [[One]] b\nc [[Two|alias]]';
    expect(wikiLinkAt(text, 5)).toBe('One');
    expect(wikiLinkAt(text, 10)).toBeNull();
    expect(wikiLinkAt(text, text.length - 2)).toBe('Two');
  });
});
