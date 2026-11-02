'use client';

import { useState } from 'react';
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
      ) : (
        <SidebarRow
          isDark={isDark}
          active={activeKey === 'self'}
          onClick={() => onNavigate(self.href)}
          testId="agent-self"
          tooltip={[`${self.name} · This Unit`, self.role].filter(Boolean).join('\n')}
          leading={<AgentAvatar name={self.name} colorKey="self" emoji={self.emoji} status="online" isDark={isDark} />}
          title={self.name}
          subtitle={self.roleShort ? `This Unit · ${self.roleShort}` : 'This Unit'}
        />
      ))}
      {agents.map(agent => (
        <AgentRow key={agent.key} agent={agent} isDark={isDark} active={agent.key === activeKey} collapsed={collapsed} onOpen={open} />
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
