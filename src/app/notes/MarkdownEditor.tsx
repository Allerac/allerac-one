'use client';

import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { wikiCompletionSource } from './wiki-completion';
import { wikiLinkAt } from './wiki-links';
import { detectLineSeparator } from './editor-text';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Titles offered after typing `[[`. */
  linkTitles?: string[];
  /** Ctrl/Cmd+click on a [[link]] opens that page. */
  onOpenLink?: (title: string) => void;
  isDarkMode: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * CodeMirror 6 markdown editor. The document is plain text in and out (no
 * normalisation), so saved note content is byte-for-byte what was typed.
 */
export function MarkdownEditor({ value, onChange, linkTitles = [], onOpenLink, isDarkMode, placeholder, autoFocus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Refs keep the extensions stable while props change.
  const onChangeRef = useRef(onChange);
  const titlesRef = useRef(linkTitles);
  const openRef = useRef(onOpenLink);
  useEffect(() => {
    onChangeRef.current = onChange;
    titlesRef.current = linkTitles;
    openRef.current = onOpenLink;
  });

  useEffect(() => {
    if (!hostRef.current) return;
    const lineSeparator = detectLineSeparator(value);
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          ...(lineSeparator ? [EditorState.lineSeparator.of(lineSeparator)] : []),
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          autocompletion({ override: [wikiCompletionSource(() => titlesRef.current)], icons: false }),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          cmPlaceholder(placeholder ?? ''),
          EditorView.contentAttributes.of({ spellcheck: 'false', 'aria-label': 'Note content' }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChangeRef.current(update.state.sliceDoc());
          }),
          EditorView.domEventHandlers({
            mousedown: (event, v) => {
              if (!(event.metaKey || event.ctrlKey) || !openRef.current) return false;
              const pos = v.posAtCoords({ x: event.clientX, y: event.clientY });
              if (pos === null) return false;
              const target = wikiLinkAt(v.state.doc.toString(), pos);
              if (!target) return false;
              event.preventDefault();
              openRef.current(target);
              return true;
            },
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '0.875rem' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.625', padding: '1rem 1.25rem' },
            '&.cm-focused': { outline: 'none' },
            '.cm-content': { caretColor: isDarkMode ? '#e5e7eb' : '#1f2937' },
            '.cm-placeholder': { color: isDarkMode ? '#4b5563' : '#d1d5db' },
            '.cm-tooltip-autocomplete': { fontSize: '0.75rem' },
          }, { dark: isDarkMode }),
        ],
      }),
    });
    viewRef.current = view;
    if (autoFocus) view.focus();
    return () => { view.destroy(); viewRef.current = null; };
    // Recreated only when the theme changes; content changes flow through the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDarkMode]);

  // Apply external value changes (e.g. a reload) without clobbering local edits.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.sliceDoc();
    if (current !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={hostRef}
      data-testid="markdown-editor"
      className={`flex-1 min-h-0 overflow-hidden ${isDarkMode ? 'bg-gray-900 text-gray-200' : 'bg-white text-gray-800'}`}
    />
  );
}
