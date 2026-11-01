'use client';

import { avatarColor, initials, type AgentStatus } from './agents-format';

const DOT: Record<AgentStatus, string> = { online: 'bg-green-500', degraded: 'bg-amber-500', offline: 'bg-gray-400' };
const LABEL: Record<AgentStatus, string> = { online: 'Online', degraded: 'Degraded', offline: 'Offline' };

interface Props {
  name: string;
  colorKey: string;
  emoji?: string | null;
  status?: AgentStatus;
  isDark: boolean;
  size?: 'sm' | 'md';
}

/** Circle with the agent's emoji or initials and a status dot (heartbeat). */
export default function AgentAvatar({ name, colorKey, emoji, status, isDark, size = 'sm' }: Props) {
  const box = size === 'md' ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-[11px]';
  return (
    <span className={`relative inline-flex flex-shrink-0 ${box}`}>
      <span className={`flex h-full w-full items-center justify-center rounded-full font-semibold text-white ${emoji ? (isDark ? 'bg-gray-700' : 'bg-gray-200') : avatarColor(colorKey)}`}>
        {emoji ?? initials(name)}
      </span>
      {status && (
        <span
          role="img"
          aria-label={LABEL[status]}
          title={LABEL[status]}
          data-testid="status-dot"
          data-status={status}
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 ${isDark ? 'border-gray-900' : 'border-white'} ${DOT[status]}`}
        />
      )}
    </span>
  );
}
