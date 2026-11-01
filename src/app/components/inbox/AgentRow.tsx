'use client';

import SidebarRow from '@/app/components/layout/SidebarRow';
import AgentAvatar from './AgentAvatar';
import { timeAgo, type AgentItem } from './agents-format';

interface Props {
  agent: AgentItem;
  isDark: boolean;
  active: boolean;
  collapsed?: boolean;
  onOpen: (agent: AgentItem) => void;
}

export function UnreadBadge({ count, testId = 'unread' }: { count: number; testId?: string }) {
  if (count <= 0) return null;
  return (
    <span data-testid={testId} className="min-w-[1.25rem] rounded-full bg-indigo-600 px-1.5 text-center text-[10px] font-semibold leading-5 text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** One remote agent: avatar + status, name, unit · short role, time, unread, pending. */
export default function AgentRow({ agent, isDark, active, collapsed = false, onOpen }: Props) {
  const unit = `${agent.unitEmoji ? `${agent.unitEmoji} ` : ''}${agent.unitDisplayName}`;
  const tooltip = [`${agent.name} · ${agent.unitDisplayName}`, agent.unitRole].filter(Boolean).join('\n');
  const avatar = <AgentAvatar name={agent.name} colorKey={agent.key} status={agent.status} isDark={isDark} />;

  if (collapsed) {
    return (
      <button type="button" title={tooltip} aria-label={`${agent.name} on ${agent.unitDisplayName}`} data-testid={`agent-${agent.key}`}
        onClick={() => onOpen(agent)}
        className={`relative mx-auto flex rounded-lg p-1.5 ${active ? (isDark ? 'bg-gray-800' : 'bg-indigo-50') : (isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')}`}>
        {avatar}
        {agent.unread > 0 && <span className="absolute -right-0.5 -top-0.5"><UnreadBadge count={agent.unread} /></span>}
      </button>
    );
  }

  return (
    <SidebarRow
      isDark={isDark}
      active={active}
      dimmed={agent.status === 'offline' || !agent.available}
      onClick={() => onOpen(agent)}
      testId={`agent-${agent.key}`}
      tooltip={tooltip}
      leading={avatar}
      title={agent.name}
      trailing={(
        <>
          {agent.pending && <span data-testid="pending" title="Waiting for a reply" className={isDark ? 'text-gray-500' : 'text-gray-400'}>…</span>}
          {agent.lastMessageAt && <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{timeAgo(agent.lastMessageAt)}</span>}
          <UnreadBadge count={agent.unread} />
        </>
      )}
      subtitle={agent.roleShort ? `${unit} · ${agent.roleShort}` : unit}
    />
  );
}
