'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import AgentList from '@/app/components/inbox/AgentList';
import AgentsInboxSection from '@/app/components/inbox/AgentsInboxSection';
import { fallbackSelfAgent } from '@/app/components/inbox/agents-format';

const DOMAIN = 'chat';

interface Props {
  /** `<unit>/<agent>` of the open chat, or 'self' for the local agent. */
  activeKey: string | null;
  /** Admins see every paired agent; everyone else only this Unit's agent. */
  isAdmin: boolean;
  /** Name for the local row when the inbox listing is not available (non-admins). */
  localName?: string;
  /** Mobile index: show the list full width instead of the chat. */
  listOnly?: boolean;
  /** Main area; receives a callback that opens the mobile agents drawer. */
  children?: (openDrawer: () => void) => ReactNode;
}

/**
 * Grok-Bot-like layout of the home screen: agent list on the left (a drawer
 * on mobile), the open chat on the right. Shared by remote and local chats.
 */
export default function AgentShell({ activeKey, isAdmin, localName = 'This Unit', listOnly = false, children }: Props) {
  const { isDark: d } = useTheme();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const muted = d ? 'text-gray-400' : 'text-gray-500';
  const close = () => setDrawerOpen(false);

  const sidebar = (
    <div className="flex h-full flex-col" data-testid="agent-shell-sidebar">
      <div className={`flex items-center gap-2 border-b px-4 py-3 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        <span className="flex-1 text-sm font-semibold">Agents</span>
        {isAdmin && <Link href="/hub" className={`text-sm ${muted} hover:underline`}>Hub</Link>}
      </div>
      <div className="flex-1 overflow-y-auto">
        {isAdmin ? (
          <AgentsInboxSection isDark={d} domainId={DOMAIN} activeKey={activeKey} onNavigate={close} />
        ) : (
          <div className="px-4 pt-4">
            <AgentList agents={[]} self={fallbackSelfAgent(localName)} archived={[]} isDark={d} activeKey={activeKey}
              onNavigate={href => { router.push(href); close(); }} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex h-[100dvh] ${d ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
      <aside className={`${listOnly ? 'w-full lg:w-72' : 'hidden w-72 lg:block'} flex-shrink-0 border-r ${d ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>{sidebar}</aside>
      {drawerOpen && !listOnly && (
        <div className="fixed inset-0 z-40 lg:hidden" data-testid="agents-drawer">
          <button type="button" aria-label="Close agents" className="absolute inset-0 bg-black/40" onClick={close} />
          <aside className={`absolute inset-y-0 left-0 w-72 ${d ? 'bg-gray-900' : 'bg-white'}`}>{sidebar}</aside>
        </div>
      )}
      <main className={`${listOnly ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col`}>
        {children?.(() => setDrawerOpen(true))}
      </main>
    </div>
  );
}
