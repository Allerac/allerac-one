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
  const boxRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setResults(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

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

  return (
    <div data-name="agent-chat-tools" className={`flex-shrink-0 border-b ${d ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'}`}>
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2">
        <div ref={boxRef} className="relative flex-1">
          <input
            type="search"
            data-name="chat-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setResults(null); } }}
            placeholder="Search your chat history"
            aria-label="Search your chat history"
            className={`w-full text-sm rounded-md border px-3 py-1.5 outline-none ${d ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
          />
          {(results || searching) && (
            <div data-name="chat-search-results" className={`absolute z-30 left-0 right-0 mt-1 max-h-96 overflow-y-auto rounded-md border shadow-lg ${panel}`}>
              {searching && !results && <p className={`px-3 py-2 text-xs ${muted}`}>Searching…</p>}
              {results && results.length === 0 && <p className={`px-3 py-2 text-xs ${muted}`}>No results</p>}
              {results?.map(hit => (
                <button
                  key={`${hit.conversationId}:${hit.messageId}:${hit.source}`}
                  type="button"
                  onClick={() => { setResults(null); onJump(hit); }}
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
        <button
          type="button"
          data-name="archive-button"
          onClick={openArchive}
          className={`text-xs px-2 py-1.5 rounded-md border ${d ? 'border-gray-700 text-gray-400 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          Archive
        </button>
      </div>

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
