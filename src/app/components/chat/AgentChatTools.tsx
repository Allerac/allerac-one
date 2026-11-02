'use client';

/**
 * Phase 4b: search box and Archive drawer for the agent chat
 * (`/agents/self/agent`). Search covers the user's own primary conversation
 * and archived conversations; archived ones open read-only.
 */
import { useEffect, useRef, useState } from 'react';
import * as chatActions from '@/app/actions/chat';
import type { ArchivedConversation, SearchHit } from '@/app/services/chat/chat-history.service';

interface Props {
  isDarkMode: boolean;
  onJump: (hit: SearchHit) => void;
  onOpenArchived: (conversation: ArchivedConversation) => void;
}

export default function AgentChatTools({ isDarkMode, onJump, onOpenArchived }: Props) {
  const d = isDarkMode;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archive, setArchive] = useState<ArchivedConversation[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await chatActions.searchChatHistory(q);
        if (id === seq.current) setResults(hits);
      } catch (error) {
        console.error('[ChatSearch] failed:', error);
        if (id === seq.current) setResults([]);
      } finally {
        if (id === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Popover: focus the input on open; close on Esc or a click outside.
  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (boxRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[data-name="chat-search-button"]')) return;
      closeSearch();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSearch(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [searchOpen]);

  const openArchive = async () => {
    setArchiveOpen(true);
    try {
      setArchive(await chatActions.loadArchivedConversations());
    } catch (error) {
      console.error('[Archive] failed to load:', error);
      setArchive([]);
    }
  };

  const panel = d ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800';
  const muted = d ? 'text-gray-500' : 'text-gray-400';
  const hover = d ? 'hover:bg-gray-800' : 'hover:bg-gray-50';
  const iconBtn = d ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100';

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    setResults(null);
  };

  return (
    <div data-name="agent-chat-tools" className="relative flex-shrink-0">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-2 flex justify-end gap-1">
        <button
          type="button"
          data-name="chat-search-button"
          aria-label="Search your chat history"
          aria-expanded={searchOpen}
          title="Search"
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          className={`p-1.5 rounded-md ${iconBtn}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
        </button>
        <button
          type="button"
          data-name="archive-button"
          aria-label="Open archive"
          title="Archive"
          onClick={openArchive}
          className={`p-1.5 rounded-md ${iconBtn}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 01-2-2V5a1 1 0 011-1h16a1 1 0 011 1v1a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>
      </div>

      {searchOpen && (
        <div
          ref={boxRef}
          role="dialog"
          aria-label="Search your chat history"
          data-name="chat-search-popover"
          className={`absolute z-30 right-3 sm:right-4 top-full mt-1 w-[min(24rem,calc(100vw-1.5rem))] rounded-lg border shadow-lg ${panel}`}
        >
          <div className="p-2">
            <input
              ref={inputRef}
              type="search"
              data-name="chat-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your chat history"
              aria-label="Search query"
              className={`w-full text-sm rounded-md border px-3 py-1.5 outline-none ${d ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
            />
          </div>
          {(results || searching) && (
            <div data-name="chat-search-results" className={`max-h-80 overflow-y-auto border-t ${d ? 'border-gray-800' : 'border-gray-100'}`}>
              {searching && !results && <p className={`px-3 py-2 text-xs ${muted}`}>Searching…</p>}
              {results && results.length === 0 && <p className={`px-3 py-2 text-xs ${muted}`}>No results</p>}
              {results?.map(hit => (
                <button
                  key={`${hit.conversationId}:${hit.messageId}:${hit.source}`}
                  type="button"
                  onClick={() => { closeSearch(); onJump(hit); }}
                  className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${d ? 'border-gray-800' : 'border-gray-100'} ${hover}`}
                >
                  <div className={`text-[11px] ${muted}`}>
                    {hit.isPrimary ? 'Current conversation' : `Archive · ${hit.conversationTitle}`}
                    {' · '}{new Date(hit.createdAt).toLocaleDateString()}
                    {hit.source !== 'message' ? ' · summary' : ''}
                  </div>
                  <div className="text-sm line-clamp-2">{hit.snippet}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {archiveOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setArchiveOpen(false)} />
          <aside data-name="archive-drawer" className={`fixed right-0 top-0 bottom-0 z-50 w-80 max-w-[90vw] border-l flex flex-col ${panel}`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${d ? 'border-gray-800' : 'border-gray-100'}`}>
              <div>
                <p className="text-sm font-medium">Archive</p>
                <p className={`text-[11px] ${muted}`}>Older conversations, read-only</p>
              </div>
              <button type="button" onClick={() => setArchiveOpen(false)} className={`text-sm px-2 ${muted}`} aria-label="Close archive">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {archive === null && <p className={`px-4 py-3 text-xs ${muted}`}>Loading…</p>}
              {archive && archive.length === 0 && <p className={`px-4 py-3 text-xs ${muted}`}>No archived conversations</p>}
              {archive?.map(conv => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => { setArchiveOpen(false); onOpenArchived(conv); }}
                  className={`w-full text-left px-4 py-2 ${hover}`}
                >
                  <div className="text-sm truncate">{conv.title}</div>
                  <div className={`text-[11px] ${muted}`}>
                    {new Date(conv.updated_at).toLocaleDateString()} · {conv.message_count} messages
                    {conv.domain_slug && conv.domain_slug !== 'chat' ? ` · ${conv.domain_slug}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
