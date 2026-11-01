'use client';

import { useState } from 'react';
import { UnreadBadge } from './AgentRow';
import { timeAgo, type AgentThreadItem } from './agents-format';

interface Props {
  isDark: boolean;
  threads: AgentThreadItem[];
  currentId: string | null;
  canCreate: boolean;
  onSelect: (threadId: string) => void;
  onCreate: (title: string | null) => void;
}

/**
 * Thread picker for one agent: a dropdown on desktop, a bottom sheet on
 * mobile (same component, responsive classes). New thread is inline.
 */
export default function ThreadSwitcher({ isDark: d, threads, currentId, canCreate, onSelect, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const current = threads.find(thread => thread.threadId === currentId);
  const otherUnread = threads.filter(thread => thread.threadId !== currentId).reduce((sum, thread) => sum + thread.unread, 0);
  const close = () => { setOpen(false); setCreating(false); setTitle(''); };
  const item = `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${d ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(value => !value)} aria-haspopup="listbox" aria-expanded={open}
        className={`flex max-w-[12rem] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${d ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-100'}`}>
        <span className="truncate">{current?.title ?? (current?.isDefault ? 'Main thread' : 'Thread')}</span>
        <UnreadBadge count={otherUnread} testId="other-unread" />
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close threads" className="fixed inset-0 z-40 cursor-default bg-black/30 sm:bg-transparent" onClick={close} />
          <div role="listbox" aria-label="Threads" data-testid="thread-switcher"
            className={`fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-72 sm:rounded-xl ${d ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900 border border-gray-200'}`}>
            {canCreate && (creating ? (
              <form className="flex gap-2 p-2" onSubmit={event => { event.preventDefault(); onCreate(title.trim() || null); close(); }}>
                <input autoFocus aria-label="New thread title" placeholder="Title (optional)" maxLength={200} value={title}
                  onChange={event => setTitle(event.target.value)}
                  className={`min-w-0 flex-1 rounded border px-2 py-1 text-sm ${d ? 'border-gray-600 bg-gray-900' : 'border-gray-300 bg-white'}`} />
                <button type="submit" className="rounded bg-indigo-600 px-2 text-sm text-white">Create</button>
              </form>
            ) : (
              <button type="button" className={item} onClick={() => setCreating(true)}>＋ New thread</button>
            ))}
            {threads.map(thread => (
              <button key={thread.threadId} type="button" role="option" aria-selected={thread.threadId === currentId}
                className={`${item} ${thread.threadId === currentId ? (d ? 'bg-gray-700' : 'bg-indigo-50') : ''}`}
                onClick={() => { onSelect(thread.threadId); close(); }}>
                <span className="flex-1 truncate">{thread.title ?? (thread.isDefault ? 'Main thread' : 'Thread')}</span>
                {thread.pending && <span className={d ? 'text-gray-500' : 'text-gray-400'}>…</span>}
                <span className={`text-[11px] ${d ? 'text-gray-500' : 'text-gray-400'}`}>{timeAgo(thread.lastMessageAt)}</span>
                <UnreadBadge count={thread.unread} testId="thread-unread" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
