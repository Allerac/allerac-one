'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import AgentAvatar from '@/app/components/inbox/AgentAvatar';
import AgentShell from '@/app/agents/_shell/AgentShell';
import FederatedComposer from '@/app/components/inbox/FederatedComposer';
import FederatedMessageList from '@/app/components/inbox/FederatedMessageList';
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
  archivedThreads: AgentThreadItem[];
  defaultThreadId: string | null;
}

function findTarget(listing: InboxListing, unitName: string, agentSlug: string): Target | null {
  const agent = flattenAgents(listing).find(item => item.unitName === unitName && item.slug === agentSlug);
  if (agent) {
    return {
      peerId: agent.peerId, unitDisplayName: agent.unitDisplayName, unitRole: agent.unitRole, agentName: agent.name,
      status: agent.status, canSend: agent.available, threads: agent.threads, archivedThreads: agent.archivedThreads,
      defaultThreadId: agent.defaultThreadId,
    };
  }
  const group = listing.archived.find(item => item.name === unitName);
  const threads = group?.threads.filter(thread => thread.agentSlug === agentSlug) ?? [];
  if (!group || threads.length === 0) return null;
  return {
    peerId: group.peerId, unitDisplayName: group.displayName, unitRole: null, agentName: agentSlug, status: 'offline', canSend: false,
    threads: threads.map((thread, index) => ({ threadId: thread.threadId, title: thread.title, isDefault: index === 0, lastMessageAt: thread.lastMessageAt, unread: 0, pending: false })),
    archivedThreads: [],
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
 * Full chat view with one remote agent (Agents redesign). Phase 5: one thread
 * per agent; "New topic" restarts the agent's context, and older threads are
 * read-only in the Archive (opened with ?thread=).
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const agentKey = `${unitName}/${agentSlug}`;
  const target = useMemo(() => (listing ? findTarget(listing, unitName, agentSlug) : null), [listing, unitName, agentSlug]);

  // Resolve the agent and its thread (default thread, or create one on first open).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await inboxApi.list(DOMAIN).catch(err => { setError(err instanceof Error ? err.message : 'Failed to load'); return null; });
      if (cancelled || !next) return;
      setListing(next);
      const found = findTarget(next, unitName, agentSlug);
      if (!found) { setMissing(true); return; }
      const known = requestedThread && [...found.threads, ...found.archivedThreads].some(thread => thread.threadId === requestedThread)
        ? requestedThread : null;
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
    setArchiveOpen(false);
    setThreadId(id);
    setView(null);
    router.replace(agentHref(unitName, agentSlug, id));
  };

  const newTopic = async () => {
    if (!threadId || sending) return;
    setError(null);
    try {
      const { divider } = await inboxApi.newTopic(DOMAIN, threadId);
      setView(current => current ? { ...current, messages: [...current.messages, divider] } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new topic');
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
  const archived = view?.archived === true;

  return (
    <AgentShell activeKey={agentKey} isAdmin>
      {openDrawer => (<>
        <header className={`flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
          <button type="button" aria-label="Open agents" className="rounded-lg p-1.5 lg:hidden" onClick={openDrawer}>☰</button>
          <AgentAvatar name={agentName} colorKey={agentKey} status={target?.status ?? 'offline'} isDark={d} size="md" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{agentTitle(agentName, unitLabel)}</h1>
            {archived
              ? <p className={`truncate text-xs ${muted}`} data-testid="archived-label">Archived: {view?.thread.title ?? 'thread'}</p>
              : target?.unitRole && <p className={`hidden truncate text-xs sm:block ${muted}`} title={target.unitRole}>{target.unitRole}</p>}
          </div>
          {archived && target?.defaultThreadId && (
            <button type="button" className="rounded-lg px-2 py-1 text-xs underline" onClick={() => switchThread(target.defaultThreadId!)}>Back to chat</button>
          )}
          {target && target.archivedThreads.length > 0 && (
            <div className="relative">
              <button type="button" aria-label="Archive" title="Archived threads (read-only)" onClick={() => setArchiveOpen(value => !value)}
                className={`rounded-lg p-1.5 ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </button>
              {archiveOpen && (
                <div data-testid="archive-list" className={`absolute right-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border py-1 text-sm shadow-xl ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                  <p className={`px-3 py-1 text-xs ${muted}`}>Archived threads (read-only)</p>
                  {target.archivedThreads.map(thread => (
                    <button key={thread.threadId} type="button" onClick={() => switchThread(thread.threadId)}
                      className={`block w-full truncate px-3 py-2 text-left hover:bg-black/5 ${thread.threadId === threadId ? 'font-semibold' : ''}`}>
                      {thread.title ?? 'Untitled'}
                      {thread.lastMessageAt && <span className={`block text-xs ${muted}`}>{new Date(thread.lastMessageAt).toLocaleDateString()}</span>}
                    </button>
                  ))}
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
          {!readOnly && view && (
            <div className="flex justify-end pb-2">
              <button type="button" data-testid="new-topic-button" onClick={() => void newTopic()}
                disabled={sending || waitingReply || (view.messages.at(-1)?.role === 'system' && view.messages.at(-1)?.content === 'New topic')}
                title="Start a new topic: the agent stops using earlier messages as context. Nothing is deleted."
                className={`rounded-md border px-2 py-1 text-xs disabled:opacity-40 ${d ? 'border-gray-700 text-gray-400 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                New topic
              </button>
            </div>
          )}
          {readOnly && view ? (
            <p className={`py-3 text-center text-xs ${muted}`}>
              {archived ? 'This thread is archived and read-only.' : 'Unit no longer paired. This history is read-only.'}
            </p>
          ) : (
            <FederatedComposer isDark={d} disabled={!view || sending} placeholder={`Message ${agentName} on ${unitLabel}…`} onSend={send} />
          )}
        </div>
      </>)}
    </AgentShell>
  );
}
