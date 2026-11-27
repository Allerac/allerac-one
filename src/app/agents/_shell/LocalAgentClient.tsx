'use client';

import Link from 'next/link';
import AgentShell from './AgentShell';
import ChatClient from '@/app/chat/ChatClient';
import { useTheme } from '@/app/context/ThemeContext';
import { botSettingsHref } from '@/app/components/bots/bots-api';

export interface LocalBotHeader {
  slug: string;
  displayName: string;
  emoji: string | null;
  role: string | null;
}

interface Props {
  isAdmin: boolean;
  localName: string;
  /** Data pages for the 'Pages' menu (already filtered on the server). */
  pages?: { path: string; label: string; icon: string }[];
  /** A bot of this Unit (multi-bot PR 4); absent for the default agent. */
  bot?: LocalBotHeader;
  /** Show the "My bots" section in the sidebar. */
  botsEnabled?: boolean;
}

/** This Unit's own agent, or one of its bots: the regular local chat, embedded in the agents shell. */
export default function LocalAgentClient({ isAdmin, localName, pages = [], bot, botsEnabled = false }: Props) {
  const { isDark: d } = useTheme();
  const domainSlug = bot?.slug ?? 'chat';
  return (
    <AgentShell activeKey={bot ? `self/${bot.slug}` : 'self'} isAdmin={isAdmin} localName={localName} pages={pages} botsEnabled={botsEnabled}>
      {openDrawer => (<>
        {bot && (
          <div data-testid="bot-header" className={`flex items-center gap-2 border-b px-3 py-2 text-sm sm:px-4 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
            <span aria-hidden="true">{bot.emoji ?? '🤖'}</span>
            <span className="font-semibold">{bot.displayName}</span>
            {bot.role && <span className={`truncate ${d ? 'text-gray-400' : 'text-gray-500'}`}>· {bot.role}</span>}
            <span className="flex-1" />
            <Link href={botSettingsHref(bot.slug)} aria-label={`Configure ${bot.displayName}`} className={`rounded px-2 py-0.5 ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>⚙</Link>
          </div>
        )}
        <div className="min-h-0 flex-1" data-testid="local-agent-chat">
          {/* key: switching bots remounts the chat, so no state leaks between them. */}
          <ChatClient key={domainSlug} domainSlug={domainSlug} defaultSidebarCollapsed isAdmin={isAdmin} embedded onOpenAgents={openDrawer} />
        </div>
      </>)}
    </AgentShell>
  );
}
