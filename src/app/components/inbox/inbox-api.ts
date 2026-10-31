/** Browser client for /api/inbox (federation P4a/P4b). Never sees peer keys. */
import type {
  InboxListing, InboxMessagePage, InboxMessageView, InboxSendResult, InboxThreadView,
} from '@/federation/inbox.service';

export type { InboxListing, InboxMessagePage, InboxMessageView, InboxThreadView };

export class InboxApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, domain: string, init?: RequestInit): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${path}${separator}domain=${encodeURIComponent(domain)}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } | string } | null;
  if (!response.ok) {
    const error = typeof body?.error === 'object' ? body.error : { message: body?.error };
    throw new InboxApiError(error?.code ?? 'error', error?.message ?? `HTTP ${response.status}`, response.status);
  }
  return body?.data as T;
}

export type SendResult = InboxSendResult;

export const inboxApi = {
  list: (domain: string) => call<InboxListing>('/api/inbox/agents', domain),
  openThread: (domain: string, peerId: string, agent: string, options: { new?: boolean; title?: string } = {}) =>
    call<{ thread: { id: string; title: string | null } }>('/api/inbox/threads', domain, {
      method: 'POST', body: JSON.stringify({ peerId, agent, ...options }),
    }),
  olderMessages: (domain: string, threadId: string, before: string) =>
    call<InboxMessagePage>(`/api/inbox/threads/${encodeURIComponent(threadId)}/messages?before=${encodeURIComponent(before)}`, domain),
  renameThread: (domain: string, threadId: string, title: string) =>
    call<{ thread: { id: string; title: string } }>(`/api/inbox/threads/${encodeURIComponent(threadId)}`, domain, {
      method: 'PATCH', body: JSON.stringify({ title }),
    }),
  deleteThread: (domain: string, threadId: string) =>
    call<{ deleted: boolean }>(`/api/inbox/threads/${encodeURIComponent(threadId)}`, domain, { method: 'DELETE' }),
  getThread: (domain: string, threadId: string) =>
    call<InboxThreadView>(`/api/inbox/threads/${encodeURIComponent(threadId)}`, domain),
  send: (domain: string, threadId: string, content: string) =>
    call<SendResult>(`/api/inbox/threads/${encodeURIComponent(threadId)}/messages`, domain, {
      method: 'POST', body: JSON.stringify({ content }),
    }),
  retry: (domain: string, threadId: string, messageId: string) =>
    call<SendResult>(`/api/inbox/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/retry`, domain, {
      method: 'POST',
    }),
  deleteHistory: (domain: string, peerId: string) =>
    call<{ deleted: number }>(`/api/inbox/peers/${encodeURIComponent(peerId)}/history`, domain, { method: 'DELETE' }),
};
