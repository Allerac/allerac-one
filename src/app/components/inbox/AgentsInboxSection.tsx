'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sidebarHeaderClass } from '@/app/components/layout/SidebarRow';
import AgentList from './AgentList';
import { UnreadBadge } from './AgentRow';
import { flattenAgents, selfAgent } from './agents-format';
import { inboxApi, type InboxListing, type InboxUpdates } from './inbox-api';

/** Unread/pending refresh (visible tab / hidden tab). */
export const UPDATES_VISIBLE_MS = 20_000;
export const UPDATES_HIDDEN_MS = 60_000;
/** Agent list (names, status) refresh. */
export const LISTING_REFRESH_MS = 60_000;

interface Props {
  isDark: boolean;
  domainId: string;
  /** Desktop icon rail: avatars only. */
  collapsed?: boolean;
  /** `<unit>/<agent>` of the open agent chat, highlighted. */
  activeKey?: string | null;
  /** Called after navigating (mobile closes its drawer). */
  onNavigate?: () => void;
}

/**
 * Sidebar "Agents" section: every agent exposed by paired units, one row each,
 * unread first. Local domains are not listed (the domain switcher has them).
 * Admin only; the parent decides visibility with canUseInbox().
 */
export default function AgentsInboxSection({ isDark: d, domainId, collapsed = false, activeKey = null, onNavigate }: Props) {
  const router = useRouter();
  const [listing, setListing] = useState<InboxListing | null>(null);
  const [updates, setUpdates] = useState<InboxUpdates | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => inboxApi.list(domainId)
      .then(data => { if (!cancelled) { setListing(data); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load agents'); });
    void load();
    const timer = setInterval(() => { void load(); }, LISTING_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [domainId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await inboxApi.updates(domainId);
        if (!cancelled) setUpdates(next);
      } catch {
        // Badges are best effort; the listing keeps the last known counts.
      }
      if (cancelled) return;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      timer = setTimeout(() => void tick(), hidden ? UPDATES_HIDDEN_MS : UPDATES_VISIBLE_MS);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [domainId]);

  const agents = useMemo(() => flattenAgents(listing, updates), [listing, updates]);
  const archived = listing?.archived ?? [];
  const self = useMemo(() => selfAgent(listing), [listing]);
  const totalUnread = updates?.totalUnread ?? agents.reduce((sum, agent) => sum + agent.unread, 0);

  if (!listing || (agents.length === 0 && archived.length === 0)) {
    return error && !collapsed ? <p className="px-4 text-xs text-red-500">{error}</p> : null;
  }

  const navigate = (href: string) => {
    router.push(href);
    onNavigate?.();
  };

  if (collapsed) {
    return (
      <div className="mb-2 px-2" data-testid="agents-inbox">
        <AgentList agents={agents} self={self} archived={[]} isDark={d} activeKey={activeKey} collapsed onNavigate={navigate} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4" data-testid="agents-inbox">
      <button type="button" onClick={() => setExpanded(value => !value)} className="group mb-2 flex w-full items-center justify-between px-2" aria-expanded={expanded}>
        <span className="flex items-center gap-2">
          <span className={sidebarHeaderClass(d)}>Agents</span>
          <UnreadBadge count={totalUnread} testId="total-unread" />
        </span>
        <svg className={`h-3.5 w-3.5 transition-all duration-200 ${expanded ? '' : '-rotate-90'} ${d ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="max-h-[45vh] overflow-y-auto">
          <AgentList agents={agents} self={self} archived={archived} isDark={d} activeKey={activeKey} onNavigate={navigate} />
        </div>
      )}
      {error && <p className="px-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
