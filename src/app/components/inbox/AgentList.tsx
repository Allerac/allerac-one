'use client';

import { useState } from 'react';
import SidebarRow from '@/app/components/layout/SidebarRow';
import AgentRow from './AgentRow';
import { agentHref, type AgentItem } from './agents-format';
import type { InboxListing } from './inbox-api';

interface Props {
  agents: AgentItem[];
  archived: InboxListing['archived'];
  isDark: boolean;
  activeKey?: string | null;
  collapsed?: boolean;
  onNavigate: (href: string) => void;
}

/** Flat, activity-sorted list of remote agents plus a collapsed "Archived" fold. */
export default function AgentList({ agents, archived, isDark, activeKey, collapsed = false, onNavigate }: Props) {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const muted = isDark ? 'text-gray-500' : 'text-gray-400';
  const open = (agent: AgentItem) => onNavigate(agentHref(agent.unitName, agent.slug));

  return (
    <div className={collapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5'} data-testid="agent-list">
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
