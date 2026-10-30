'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { inboxApi, type InboxMessageView, type InboxThreadView, type SendResult } from './inbox-api';

interface Props {
  isDark: boolean;
  domainId: string;
  threadId: string;
  onClose: () => void;
  /** Called after a send so the sidebar can refresh previews. */
  onChanged?: () => void;
}

const ERROR_LABELS: Record<string, string> = {
  timeout: 'The unit did not answer within 60s.',
  peer_unreachable: 'The unit could not be reached.',
  peer_access_denied: 'The unit refused the request.',
  peer_rate_limited: 'The unit is rate limiting requests.',
  capability_not_granted: 'This unit did not grant agent access.',
  peer_not_active: 'Unit no longer paired.',
};

function applyResult(messages: InboxMessageView[], result: SendResult): InboxMessageView[] {
  const next = messages.filter(message => message.id !== result.userMessage.id && !message.id.startsWith('local-'));
  next.push(result.userMessage);
  if (result.agentMessage) next.push(result.agentMessage);
  return next;
}

/**
 * Federated thread with a remote agent (P4a). Remote replies are untrusted:
 * they are rendered as plain text (React escapes it; no HTML, no markdown links).
 */
export default function FederatedThreadPanel({ isDark: d, domainId, threadId, onClose, onChanged }: Props) {
  const [view, setView] = useState<InboxThreadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await inboxApi.getThread(domainId, threadId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    }
  }, [domainId, threadId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView?.({ block: 'end' }); }, [view?.messages.length, sending]);

  const run = async (action: () => Promise<SendResult>, optimistic?: InboxMessageView) => {
    if (!view) return;
    setSending(true);
    setError(null);
    if (optimistic) setView({ ...view, messages: [...view.messages, optimistic] });
    try {
      const result = await action();
      setView(current => current ? { ...current, messages: applyResult(current.messages, result) } : current);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
      await load();
    } finally {
      setSending(false);
    }
  };

  const send = () => {
    const content = draft.trim();
    if (!content || sending || !view || view.readOnly) return;
    setDraft('');
    void run(() => inboxApi.send(domainId, threadId, content), {
      id: `local-${Date.now()}`, role: 'user', content, status: 'pending', truncated: false, errorCode: null,
      createdAt: new Date().toISOString(),
    });
  };

  const retry = (messageId: string) => {
    if (sending) return;
    void run(() => inboxApi.retry(domainId, threadId, messageId));
  };

  const bubble = (message: InboxMessageView) => {
    const mine = message.role === 'user';
    const failed = message.status === 'failed' || message.status === 'timeout';
    return (
      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid={`msg-${message.status}`}>
        <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine
          ? (d ? 'bg-indigo-700 text-white' : 'bg-indigo-600 text-white')
          : (d ? 'bg-gray-800 text-gray-100' : 'bg-gray-100 text-gray-900')}`}>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {message.truncated && <p className="mt-1 text-xs opacity-70">(answer truncated by the unit)</p>}
          {failed && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-red-300">{ERROR_LABELS[message.errorCode ?? ''] ?? 'Send failed.'}</span>
              {!view?.readOnly && (
                <button type="button" onClick={() => retry(message.id)} className="underline" disabled={sending}>Retry</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div role="dialog" aria-label="Remote agent thread" className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div className={`flex h-full w-full max-w-xl flex-col ${d ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
        <header className={`flex items-center gap-2 border-b px-4 py-3 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {view ? `${view.thread.agentSlug} @ ${view.unit.displayName}` : 'Loading…'}
            </p>
          </div>
          <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${d ? 'bg-gray-700' : 'bg-gray-200'}`}>remote</span>
          <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-lg leading-none">×</button>
        </header>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {view?.messages.map(bubble)}
          {sending && (
            <div className="flex justify-start" data-testid="thinking">
              <div className={`rounded-lg px-3 py-2 text-sm italic ${d ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>thinking…</div>
            </div>
          )}
          {view && view.messages.length === 0 && !sending && (
            <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>No messages yet. Replies come from another unit and may take up to a minute.</p>
          )}
          <div ref={bottomRef} />
        </div>
        {error && <p className="px-4 pb-2 text-xs text-red-500" role="alert">{error}</p>}
        {view?.readOnly ? (
          <p className={`border-t px-4 py-3 text-xs ${d ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
            Unit no longer paired. This history is read-only.
          </p>
        ) : (
          <form
            className={`flex gap-2 border-t p-3 ${d ? 'border-gray-700' : 'border-gray-200'}`}
            onSubmit={event => { event.preventDefault(); send(); }}
          >
            <textarea
              aria-label="Message"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }}
              maxLength={4000}
              rows={2}
              disabled={!view || sending}
              className={`flex-1 resize-none rounded border px-2 py-1 text-sm ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'}`}
            />
            <button type="submit" disabled={!view || sending || !draft.trim()} className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50">
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
