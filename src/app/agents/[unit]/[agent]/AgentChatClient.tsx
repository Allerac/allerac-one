'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import AgentAvatar from '@/app/components/inbox/AgentAvatar';
import AgentShell from '@/app/agents/_shell/AgentShell';
import FederatedComposer from '@/app/components/inbox/FederatedComposer';
import FederatedMessageList from '@/app/components/inbox/FederatedMessageList';
import ThreadSwitcher from '@/app/components/inbox/ThreadSwitcher';
import { agentHref, agentTitle, flattenAgents, type AgentItem, type AgentThreadItem } from '@/app/components/inbox/agents-format';
import { inboxApi, type InboxListing, type InboxMessageView, type InboxThreadView, type SendResult } from '@/app/components/inbox/inbox-api';

/** Open-thread poll while a reply is pending (the server polls the peer on each read). */
export const POLL_PANEL_MS = 3000;
const DOMAIN = 'chat';

interface Props {
  unitName: string;
  agentSlug: string;
  threadId: string | null;
}

interface Target {
  peerId: string;
  unitDisplayName: string;
  unitRole: string | null;
  agentName: string;
  status: AgentItem['status'];
  canSend: boolean;
  threads: AgentThreadItem[];
  defaultThreadId: string | null;
}

function findTarget(listing: InboxListing, unitName: string, agentSlug: string): Target | null {
  const agent = flattenAgents(listing).find(item => item.unitName === unitName && item.slug === agentSlug);
  if (agent) {
    return {
      peerId: agent.peerId, unitDisplayName: agent.unitDisplayName, unitRole: agent.unitRole, agentName: agent.name,
      status: agent.status, canSend: agent.available, threads: agent.threads, defaultThreadId: agent.defaultThreadId,
    };
  }
  const group = listing.archived.find(item => item.name === unitName);
  const threads = group?.threads.filter(thread => thread.agentSlug === agentSlug) ?? [];
  if (!group || threads.length === 0) return null;
  return {
    peerId: group.peerId, unitDisplayName: group.displayName, unitRole: null, agentName: agentSlug, status: 'offline', canSend: false,
    threads: threads.map((thread, index) => ({ threadId: thread.threadId, title: thread.title, isDefault: index === 0, lastMessageAt: thread.lastMessageAt, unread: 0, pending: false })),
    defaultThreadId: threads[0].threadId,
  };
}

function applyResult(messages: InboxMessageView[], result: SendResult): InboxMessageView[] {
  const next = messages.filter(message => message.id !== result.userMessage.id && !message.id.startsWith('local-'));
  next.push(result.userMessage, ...(result.notices ?? []));
  if (result.agentMessage) next.push(result.agentMessage);
  return next;
}

/**
 * Full chat view with one remote agent (Agents redesign). The sidebar lists
 * every remote agent; the main area is this thread, with a thread switcher.
 */
export default function AgentChatClient({ unitName, agentSlug, threadId: requestedThread }: Props) {
  const { isDark: d } = useTheme();
  const router = useRouter();
  const [listing, setListing] = useState<InboxListing | null>(null);
  const [missing, setMissing] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(requestedThread);
  const [view, setView] = useState<InboxThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const agentKey = `${unitName}/${agentSlug}`;
  const target = useMemo(() => (listing ? findTarget(listing, unitName, agentSlug) : null), [listing, unitName, agentSlug]);

  const refreshListing = useCallback(async () => {
    try {
      const next = await inboxApi.list(DOMAIN);
      setListing(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
      return null;
    }
  }, []);

  // Resolve the agent and its thread (default thread, or create one on first open).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await inboxApi.list(DOMAIN).catch(err => { setError(err instanceof Error ? err.message : 'Failed to load'); return null; });
      if (cancelled || !next) return;
      setListing(next);
      const found = findTarget(next, unitName, agentSlug);
      if (!found) { setMissing(true); return; }
      const known = requestedThread && found.threads.some(thread => thread.threadId === requestedThread) ? requestedThread : null;
      let id = known ?? found.defaultThreadId;
      if (!id && found.canSend) {
        try {
          id = (await inboxApi.openThread(DOMAIN, found.peerId, agentSlug)).thread.id;
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open thread');
          return;
        }
      }
      if (!cancelled) { setThreadId(id); if (!id) setMissing(true); }
    })();
    return () => { cancelled = true; };
  }, [unitName, agentSlug, requestedThread]);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    inboxApi.getThread(DOMAIN, threadId)
      .then(next => { if (!cancelled) { setView(next); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load thread'); });
    return () => { cancelled = true; };
  }, [threadId]);

  const lastId = view?.messages.at(-1)?.id;
  useEffect(() => { bottomRef.current?.scrollIntoView?.({ block: 'end' }); }, [lastId, sending]);

  // P4c: poll while the newest user message is still pending.
  const lastUser = view ? [...view.messages].reverse().find(message => message.role === 'user') : undefined;
  const waitingReply = !sending && lastUser?.status === 'pending' && !lastUser.id.startsWith('local-');
  useEffect(() => {
    if (!waitingReply || !threadId) return;
    const timer = setInterval(() => {
      inboxApi.getThread(DOMAIN, threadId)
        .then(next => {
          setView(current => {
            if (!current) return next;
            const fresh = new Set(next.messages.map(message => message.id));
            const firstFresh = next.messages[0]?.createdAt;
            const older = firstFresh ? current.messages.filter(message => !fresh.has(message.id) && message.createdAt < firstFresh) : [];
            return { ...next, messages: [...older, ...next.messages], nextCursor: older.length ? current.nextCursor : next.nextCursor };
          });
          const stillPending = [...next.messages].reverse().find(message => message.role === 'user')?.status === 'pending';
          if (!stillPending) void inboxApi.markRead(DOMAIN, threadId).catch(() => undefined);
        })
        .catch(() => undefined);
    }, POLL_PANEL_MS);
    return () => clearInterval(timer);
  }, [waitingReply, threadId]);

  const switchThread = (id: string) => {
    setThreadId(id);
    setView(null);
    router.replace(agentHref(unitName, agentSlug, id));
  };

  const createThread = async (title: string | null) => {
    if (!target) return;
    try {
      const { thread } = await inboxApi.openThread(DOMAIN, target.peerId, agentSlug, { new: true, ...(title ? { title } : {}) });
      await refreshListing();
      switchThread(thread.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create thread');
    }
  };

  const deleteThread = async () => {
    setMenuOpen(false);
    if (!threadId || !window.confirm('Delete this thread from this unit? The other unit keeps its own copy.')) return;
    try {
      await inboxApi.deleteThread(DOMAIN, threadId);
      const next = await refreshListing();
      const rest = next ? findTarget(next, unitName, agentSlug)?.threads.filter(thread => thread.threadId !== threadId) ?? [] : [];
      const fallback = rest.find(thread => thread.isDefault) ?? rest[0];
      if (fallback) switchThread(fallback.threadId);
      else { setView(null); setThreadId(null); router.replace(agentHref(unitName, agentSlug)); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const saveTitle = async () => {
    const title = renaming?.trim();
    setRenaming(null);
    if (!title || !view || !threadId || title === view.thread.title) return;
    try {
      const { thread } = await inboxApi.renameThread(DOMAIN, threadId, title);
      setView(current => current ? { ...current, thread: { ...current.thread, title: thread.title } } : current);
      void refreshListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const loadOlder = async () => {
    if (!view?.nextCursor || loadingOlder || !threadId) return;
    setLoadingOlder(true);
    try {
      const page = await inboxApi.olderMessages(DOMAIN, threadId, view.nextCursor);
      setView(current => current ? { ...current, messages: [...page.messages, ...current.messages], nextCursor: page.nextCursor } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load older messages');
    } finally {
      setLoadingOlder(false);
    }
  };

  const run = async (action: () => Promise<SendResult>, optimistic?: InboxMessageView) => {
    if (!view || !threadId) return;
    setSending(true);
    setError(null);
    if (optimistic) setView({ ...view, messages: [...view.messages, optimistic] });
    try {
      const result = await action();
      setView(current => current ? { ...current, messages: applyResult(current.messages, result) } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
      setView(await inboxApi.getThread(DOMAIN, threadId).catch(() => view));
    } finally {
      setSending(false);
    }
  };

  const send = (content: string) => {
    if (!threadId || sending || view?.readOnly) return;
    void run(() => inboxApi.send(DOMAIN, threadId, content), {
      id: `local-${Date.now()}`, role: 'user', content, status: 'pending', truncated: false, errorCode: null, createdAt: new Date().toISOString(),
    });
  };

  const unitLabel = target?.unitDisplayName ?? view?.unit.displayName ?? unitName;
  const agentName = target?.agentName ?? agentSlug;
  const readOnly = view?.readOnly ?? !target?.canSend;
  const muted = d ? 'text-gray-400' : 'text-gray-500';

  return (
    <AgentShell activeKey={agentKey} isAdmin>
      {openDrawer => (<>
        <header className={`flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
          <button type="button" aria-label="Open agents" className="rounded-lg p-1.5 lg:hidden" onClick={openDrawer}>☰</button>
          <AgentAvatar name={agentName} colorKey={agentKey} status={target?.status ?? 'offline'} isDark={d} size="md" />
          <div className="min-w-0 flex-1">
            {renaming !== null ? (
              <input aria-label="Thread title" autoFocus value={renaming} maxLength={200}
                onChange={event => setRenaming(event.target.value)} onBlur={() => void saveTitle()}
                onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); void saveTitle(); }
                  if (event.key === 'Escape') setRenaming(null);
                }}
                className={`w-full rounded border px-1 text-sm ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'}`} />
            ) : (
              <h1 className="truncate text-sm font-semibold">{agentTitle(agentName, unitLabel)}</h1>
            )}
            {target?.unitRole && <p className={`hidden truncate text-xs sm:block ${muted}`} title={target.unitRole}>{target.unitRole}</p>}
          </div>
          {target && (
            <ThreadSwitcher isDark={d} threads={target.threads} currentId={threadId} canCreate={target.canSend}
              onSelect={switchThread} onCreate={title => void createThread(title)} />
          )}
          {view && !view.readOnly && (
            <div className="relative">
              <button type="button" aria-label="Thread actions" onClick={() => setMenuOpen(value => !value)} className="rounded-lg px-2 py-1">⋯</button>
              {menuOpen && (
                <div className={`absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border py-1 text-sm shadow-xl ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-black/5" onClick={() => { setMenuOpen(false); setRenaming(view.thread.title ?? ''); }}>Rename thread</button>
                  <button type="button" className="block w-full px-3 py-2 text-left text-red-500 hover:bg-black/5" onClick={() => void deleteThread()}>Delete thread</button>
                </div>
              )}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {missing && !threadId && (
              <p className={`text-sm ${muted}`} data-testid="agent-missing">This agent is not available. The unit may be offline or no longer exposes it.</p>
            )}
            {view?.nextCursor && (
              <div className="mb-4 flex justify-center">
                <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="text-xs underline">
                  {loadingOlder ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}
            {view && view.messages.length === 0 && !sending && (
              <p className={`text-center text-sm ${muted}`}>Start a conversation with {agentName} on {unitLabel}. Replies may take a few minutes.</p>
            )}
            {view && (
              <FederatedMessageList messages={view.messages} isDark={d} agentName={agentName} agentKey={agentKey} unitName={unitLabel}
                waiting={sending || waitingReply} readOnly={view.readOnly} retrying={sending}
                onRetry={id => { if (!sending && threadId) void run(() => inboxApi.retry(DOMAIN, threadId, id)); }} />
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && <p className="px-4 pb-1 text-center text-xs text-red-500" role="alert">{error}</p>}
        <div className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-4">
          {readOnly && view ? (
            <p className={`py-3 text-center text-xs ${muted}`}>Unit no longer paired. This history is read-only.</p>
          ) : (
            <FederatedComposer isDark={d} disabled={!view || sending} placeholder={`Message ${agentName} on ${unitLabel}…`} onSend={send} />
          )}
        </div>
      </>)}
    </AgentShell>
  );
}
