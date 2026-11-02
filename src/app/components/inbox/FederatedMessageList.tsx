'use client';

import MarkdownContent, { proseClass } from '@/app/components/chat/MarkdownContent';
import AgentAvatar from './AgentAvatar';
import type { InboxMessageView } from './inbox-api';

export const ERROR_LABELS: Record<string, string> = {
  timeout: 'No answer within 10 minutes.',
  result_lost: 'The unit lost the answer; retry.',
  empty_answer: 'The agent returned an empty answer; retry.',
  unit_not_paired: 'Unit no longer paired.',
  peer_unreachable: 'The unit could not be reached.',
  peer_access_denied: 'The unit refused the request.',
  peer_rate_limited: 'The unit is rate limiting requests.',
  capability_not_granted: 'This unit did not grant agent access.',
  peer_not_active: 'Unit no longer paired.',
  peer_ask_in_progress: 'The unit is still working on this message; retry in a moment.',
};

interface Props {
  messages: InboxMessageView[];
  isDark: boolean;
  agentName: string;
  agentKey: string;
  unitName: string;
  /** Show "waiting for <unit>…" (async reply pending or a send in flight). */
  waiting: boolean;
  readOnly: boolean;
  retrying: boolean;
  onRetry: (messageId: string) => void;
}

/**
 * Messages of a federated thread. Remote replies are untrusted: they render
 * through MarkdownContent in `untrusted` mode (no raw HTML, safe links only,
 * images as links). User messages render as plain text.
 */
export default function FederatedMessageList({
  messages, isDark: d, agentName, agentKey, unitName, waiting, readOnly, retrying, onRetry,
}: Props) {
  const avatar = <AgentAvatar name={agentName} colorKey={agentKey} isDark={d} />;
  return (
    <div className="space-y-4">
      {messages.map(message => {
        if (message.role === 'system') {
          return (
            <p key={message.id} data-testid="system-note" className={`text-center text-xs italic ${d ? 'text-gray-500' : 'text-gray-400'}`}>
              {message.content}
            </p>
          );
        }
        const failed = message.status === 'failed' || message.status === 'timeout';
        const failure = failed && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-red-400">{ERROR_LABELS[message.errorCode ?? ''] ?? 'Send failed.'}</span>
            {!readOnly && <button type="button" onClick={() => onRetry(message.id)} className="underline" disabled={retrying}>Retry</button>}
          </div>
        );
        if (message.role === 'user') {
          return (
            <div key={message.id} className="flex flex-col items-end" data-testid={`msg-${message.status}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${d ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900'}`}>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
              {failure}
            </div>
          );
        }
        return (
          <div key={message.id} className="flex items-start gap-3" data-testid={`msg-${message.status}`}>
            {avatar}
            <div className="min-w-0 flex-1">
              <div className={proseClass(d)}>
                <MarkdownContent content={message.content} isDarkMode={d} untrusted />
              </div>
              {message.truncated && <p className={`mt-1 text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>(answer truncated by the unit)</p>}
              {failure}
            </div>
          </div>
        );
      })}
      {waiting && (
        <div className="flex items-center gap-3" data-testid="waiting">
          {avatar}
          <span className={`text-sm italic ${d ? 'text-gray-400' : 'text-gray-500'}`}>waiting for {unitName}…</span>
        </div>
      )}
    </div>
  );
}
