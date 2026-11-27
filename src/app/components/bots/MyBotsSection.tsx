'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarRow from '@/app/components/layout/SidebarRow';
import AgentAvatar from '@/app/components/inbox/AgentAvatar';
import { ConfigureLink } from '@/app/components/inbox/AgentList';
import { roleShort } from '@/app/components/inbox/agents-format';
import type { UnitAgent } from '@/app/services/agent/unit-agents';
import { NEW_BOT_HREF, botHref, botSettingsHref, botsApi } from './bots-api';

interface Props {
  isDark: boolean;
  /** `self/<slug>` of the open bot chat. */
  activeKey: string | null;
  onNavigate?: () => void;
}

/** Sidebar "My bots" (multi-bot PR 4): this Unit's bots other than the default agent. Admins only. */
export default function MyBotsSection({ isDark, activeKey, onNavigate }: Props) {
  const router = useRouter();
  const [bots, setBots] = useState<UnitAgent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  useEffect(() => {
    let cancelled = false;
    botsApi.list()
      .then((list) => { if (!cancelled) setBots(list.filter((bot) => !bot.isDefault && bot.enabled)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section aria-label="Bots" data-testid="my-bots" className={`border-b px-4 py-3 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
      <div className="mb-1 flex items-center">
        <span className={`flex-1 text-xs font-semibold uppercase ${muted}`}>Bots</span>
        <Link href={NEW_BOT_HREF} onClick={onNavigate} data-testid="new-bot" className={`rounded px-2 py-0.5 text-xs ${muted} hover:underline`}>
          + New bot
        </Link>
      </div>
      {failed && <p className={`px-1 text-xs ${muted}`}>Could not load bots.</p>}
      {bots && bots.length === 0 && <p className={`px-1 text-xs ${muted}`}>No bots yet.</p>}
      <div className="space-y-0.5">
        {(bots ?? []).map((bot) => (
          <div key={bot.slug} className="flex items-center gap-0.5">
            <div className="min-w-0 flex-1">
              <SidebarRow
                isDark={isDark}
                active={activeKey === `self/${bot.slug}`}
                onClick={() => { router.push(botHref(bot.slug)); onNavigate?.(); }}
                testId="bot-row"
                tooltip={[bot.displayName, bot.role].filter(Boolean).join('\n')}
                leading={<AgentAvatar name={bot.displayName} colorKey={`bot-${bot.slug}`} emoji={bot.emoji} isDark={isDark} />}
                title={bot.displayName}
                subtitle={roleShort(bot.role) ?? undefined}
              />
            </div>
            <ConfigureLink href={botSettingsHref(bot.slug)} label={bot.displayName} isDark={isDark} external={false} />
          </div>
        ))}
      </div>
    </section>
  );
}
