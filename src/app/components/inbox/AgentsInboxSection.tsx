'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FederatedThreadPanel from './FederatedThreadPanel';
import { inboxApi, type InboxListing } from './inbox-api';

interface Props {
  isDark: boolean;
  domainId: string;
}

/**
 * Sidebar "Agents" section (federation P4a): local agents first, then each
 * paired Unit's exposed agents, then archived (unpaired) Units. Admin only;
 * the parent decides visibility with canUseInbox().
 */
export default function AgentsInboxSection({ isDark: d, domainId }: Props) {
  const router = useRouter();
  const [listing, setListing] = useState<InboxListing | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setListing(await inboxApi.list(domainId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    }
  }, [domainId]);

  useEffect(() => {
    let cancelled = false;
    inboxApi.list(domainId)
      .then(data => { if (!cancelled) { setListing(data); setError(null); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load agents'); });
    return () => { cancelled = true; };
  }, [domainId]);

  const openRemote = async (peerId: string, agent: string, threadId: string | null) => {
    try {
      const id = threadId ?? (await inboxApi.openThread(domainId, peerId, agent)).thread.id;
      setOpenThreadId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open thread');
    }
  };

  const deleteHistory = async (peerId: string, name: string) => {
    if (!window.confirm(`Delete all local history with ${name}? This cannot be undone.`)) return;
    try {
      await inboxApi.deleteHistory(domainId, peerId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const muted = d ? 'text-gray-500' : 'text-gray-400';
  const rowClass = `w-full text-left rounded px-2 py-1.5 text-sm ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`;
  const hasRemote = (listing?.units.length ?? 0) > 0 || (listing?.archived.length ?? 0) > 0;

  return (
    <div className="mb-3" data-testid="agents-inbox">
      <button type="button" onClick={() => setExpanded(v => !v)} className={`text-xs uppercase px-2 mb-1 ${muted}`}>
        Agents {expanded ? '▾' : '▸'}
      </button>
      {expanded && listing && (
        <div className="space-y-2">
          {hasRemote && (
            <div>
              <p className={`px-2 text-xs ${muted}`}>
                {listing.home.emoji ?? '🏠'} {listing.home.displayName}{listing.home.role ? ` · ${listing.home.role}` : ''}
              </p>
              {listing.home.agents.map(agent => (
                <button key={agent.slug} type="button" className={rowClass}
                  onClick={() => { if (agent.slug !== domainId) router.push(`/${agent.slug}`); }}>
                  {agent.name}
                </button>
              ))}
            </div>
          )}
          {listing.units.map(unit => (
            <div key={unit.peerId} data-testid={`unit-${unit.name}`}>
              <p className={`flex items-center gap-1 px-2 text-xs ${muted}`}>
                <span
                  aria-label={unit.status}
                  className={`inline-block h-2 w-2 rounded-full ${unit.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`}
                />
                <span>{unit.emoji ?? '🛰️'} {unit.displayName}{unit.role ? ` · ${unit.role}` : ''}</span>
              </p>
              {unit.agents.length === 0 && <p className={`px-2 text-xs ${muted}`}>No agents exposed</p>}
              {unit.agents.map(agent => (
                <button key={agent.slug} type="button" className={`${rowClass} ${agent.available ? '' : 'opacity-50'}`}
                  disabled={!agent.available && !agent.threadId}
                  onClick={() => openRemote(unit.peerId, agent.slug, agent.threadId)}>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 truncate">{agent.name}</span>
                    {agent.unread > 0 && (
                      <span data-testid="unread" className="rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">{agent.unread}</span>
                    )}
                  </span>
                  {agent.preview && <span className={`block truncate text-xs ${muted}`}>{agent.preview}</span>}
                </button>
              ))}
            </div>
          ))}
          {listing.archived.length > 0 && (
            <div>
              <p className={`px-2 text-xs ${muted}`}>Archived units</p>
              {listing.archived.map(group => (
                <div key={group.peerId} data-testid={`archived-${group.name}`}>
                  <p className={`flex items-center px-2 text-xs ${muted}`}>
                    <span className="flex-1">{group.displayName} (unpaired)</span>
                    <button type="button" className="underline" onClick={() => deleteHistory(group.peerId, group.displayName)}>
                      Delete history
                    </button>
                  </p>
                  {group.threads.map(thread => (
                    <button key={thread.threadId} type="button" className={`${rowClass} opacity-70`}
                      onClick={() => setOpenThreadId(thread.threadId)}>
                      {thread.agentSlug}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className={`px-2 text-xs text-red-500`}>{error}</p>}
      {openThreadId && (
        <FederatedThreadPanel
          isDark={d}
          domainId={domainId}
          threadId={openThreadId}
          onClose={() => { setOpenThreadId(null); void load(); }}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
