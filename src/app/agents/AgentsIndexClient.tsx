'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AgentShell from './_shell/AgentShell';
import { flattenAgents, pickIndexHref } from '@/app/components/inbox/agents-format';
import { inboxApi } from '@/app/components/inbox/inbox-api';

/** Same breakpoint as the shell's `lg:` sidebar. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches;
}

interface Props {
  localLastActivity: string | null;
}

/** `/agents`: on desktop jump to the most recent agent; on mobile show the list. */
export default function AgentsIndexClient({ localLastActivity }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    inboxApi.list('chat')
      .then(listing => { if (!cancelled) router.replace(pickIndexHref(flattenAgents(listing), localLastActivity)); })
      .catch(() => { if (!cancelled) router.replace(pickIndexHref([], localLastActivity)); });
    return () => { cancelled = true; };
  }, [router, localLastActivity]);

  return <AgentShell activeKey={null} isAdmin listOnly />;
}
