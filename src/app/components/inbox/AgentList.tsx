'use client';

import { useState, type ReactNode } from 'react';
import SidebarRow from '@/app/components/layout/SidebarRow';
import AgentAvatar from './AgentAvatar';
import AgentRow from './AgentRow';
import { agentHref, type AgentItem, type SelfAgentItem } from './agents-format';
import type { InboxListing } from './inbox-api';

interface Props {
  agents: AgentItem[];
  /** This Unit's own agent, rendered first. */
  self?: SelfAgentItem | null;
  archived: InboxListing['archived'];
  isDark: boolean;
  activeKey?: string | null;
  collapsed?: boolean;
  onNavigate: (href: string) => void;
}

/** "Configure" item of a row: the agent Unit's settings page (remote ones open in a new tab). */
export function ConfigureLink({ href, label, isDark, external }: { href: string; label: string; isDark: boolean; external: boolean }) {
  return (
    <a
      href={href}
      title="Configure"
      aria-label={`Configure ${label}`}
      data-testid="agent-configure"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`flex-shrink-0 rounded-lg px-2 py-1 text-xs opacity-60 hover:opacity-100 focus:opacity-100 ${isDark ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
    >
      ⚙
    </a>
  );
}

function withConfigure(row: ReactNode, href: string | null, label: string, isDark: boolean, external: boolean) {
  if (!href) return row;
  return (
    <div className="flex items-center gap-0.5">
      <div className="min-w-0 flex-1">{row}</div>
      <ConfigureLink href={href} label={label} isDark={isDark} external={external} />
    </div>
  );
}

/** Flat, activity-sorted list of remote agents plus a collapsed "Archived" fold. */
export default function AgentList({ agents, self = null, archived, isDark, activeKey, collapsed = false, onNavigate }: Props) {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const muted = isDark ? 'text-gray-500' : 'text-gray-400';
  const open = (agent: AgentItem) => onNavigate(agentHref(agent.unitName, agent.slug));

  return (
    <div className={collapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5'} data-testid="agent-list">
      {self && (collapsed ? (
        <button type="button" title={`${self.name} · This Unit`} aria-label={`${self.name} (this Unit)`} data-testid="agent-self"
          onClick={() => onNavigate(self.href)}
          className={`mx-auto flex rounded-lg p-1.5 ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
          <AgentAvatar name={self.name} colorKey="self" emoji={self.emoji} status="online" isDark={isDark} />
        </button>
      ) : withConfigure(
        <SidebarRow
          isDark={isDark}
          active={activeKey === 'self'}
          onClick={() => onNavigate(self.href)}
          testId="agent-self"
          tooltip={[`${self.name} · This Unit`, self.role].filter(Boolean).join('\n')}
          leading={<AgentAvatar name={self.name} colorKey="self" emoji={self.emoji} status="online" isDark={isDark} />}
          title={self.name}
          subtitle={self.roleShort ? `This Unit · ${self.roleShort}` : 'This Unit'}
        />,
        self.configureUrl, self.name, isDark, false,
      ))}
      {agents.map(agent => (
        <div key={agent.key}>
          {collapsed
            ? <AgentRow agent={agent} isDark={isDark} active={agent.key === activeKey} collapsed onOpen={open} />
            : withConfigure(
              <AgentRow agent={agent} isDark={isDark} active={agent.key === activeKey} onOpen={open} />,
              agent.configureUrl, agent.name, isDark, true,
            )}
        </div>
      ))}
      {!collapsed && archived.length > 0 && (
        <div className="pt-1">
          <button type="button" onClick={() => setArchivedOpen(value => !value)} className={`px-3 py-1 text-xs ${muted}`} aria-expanded={archivedOpen}>
            {archivedOpen ? '▾' : '▸'} Archived ({archived.reduce((sum, group) => sum + group.threads.length, 0)})
          </button>
          {archivedOpen && archived.map(group => group.threads.map(thread => (
            <SidebarRow
              key={thread.threadId}
              isDark={isDark}
              dimmed
              testId="archived-thread"
              onClick={() => onNavigate(agentHref(group.name, thread.agentSlug, thread.threadId))}
              title={thread.title ?? thread.agentSlug}
              subtitle={`${group.displayName} (unpaired)`}
            />
          )))}
        </div>
      )}
    </div>
  );
}
