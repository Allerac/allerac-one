/**
 * Pure helpers for the Agents section (sidebar list, avatars, chat view).
 * No React, no IO: easy to test and shared by desktop and mobile.
 */
import type { InboxListing, InboxUpdates } from '@/federation/inbox.service';
import { LOCAL_CONFIGURE_URL, SELF_AGENT_HREF } from '@/federation/configure-url';

export { LOCAL_CONFIGURE_URL, SELF_AGENT_HREF, peerConfigureUrl } from '@/federation/configure-url';

export type AgentStatus = 'online' | 'degraded' | 'offline';

export interface AgentThreadItem {
  threadId: string;
  title: string | null;
  isDefault: boolean;
  lastMessageAt: string | null;
  unread: number;
  pending: boolean;
}

/** One remote agent row in the flat, activity-sorted list. */
export interface AgentItem {
  key: string;
  peerId: string;
  unitName: string;
  unitDisplayName: string;
  unitEmoji: string | null;
  unitRole: string | null;
  roleShort: string | null;
  status: AgentStatus;
  slug: string;
  name: string;
  available: boolean;
  unread: number;
  pending: boolean;
  lastMessageAt: string | null;
  preview: string | null;
  defaultThreadId: string | null;
  threads: AgentThreadItem[];
  /** Settings page of the agent's Unit (`https://<peer origin>/hub/settings`); null when unknown. */
  configureUrl: string | null;
}

/** This Unit's own agent, always the first row (one Unit = one agent). */
export interface SelfAgentItem {
  key: 'self';
  name: string;
  emoji: string | null;
  role: string | null;
  roleShort: string | null;
  href: string;
  /** Local settings page. */
  configureUrl: string;
}

/** Unit id used in `/agents/<unit>/<agent>` for this Unit's own agent. */
export const SELF_UNIT = 'self';


export const ROLE_SHORT_CHARS = 24;

/** First segment of a role, cut to ~24 chars: "Medical · cuida da saúde…" → "Medical". */
export function roleShort(role: string | null | undefined, max = ROLE_SHORT_CHARS): string | null {
  const first = role?.split(/\s[·|–—-]\s|[·|,;]/)[0]?.trim();
  if (!first) return null;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

export function initials(name: string): string {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

const AVATAR_COLORS = ['bg-indigo-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600', 'bg-sky-600', 'bg-violet-600', 'bg-teal-600', 'bg-fuchsia-600'];

/** Stable avatar colour for a unit + agent. */
export function avatarColor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function agentHref(unitName: string, slug: string, threadId?: string | null): string {
  const base = `/agents/${encodeURIComponent(unitName)}/${encodeURIComponent(slug)}`;
  return threadId ? `${base}?thread=${encodeURIComponent(threadId)}` : base;
}

const time = (value: string | null) => (value ? Date.parse(value) : 0);

/** Unread first, then most recent activity, then name. */
export function compareAgents(a: AgentItem, b: AgentItem): number {
  if ((a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1;
  const recent = time(b.lastMessageAt) - time(a.lastMessageAt);
  if (recent !== 0) return recent;
  return a.name.localeCompare(b.name) || a.unitName.localeCompare(b.unitName);
}

/**
 * Flattens the listing into one row per remote agent across all paired units,
 * applying live unread/pending from /api/inbox/updates. Local domains are never
 * included: they are not agents.
 */
export function flattenAgents(listing: InboxListing | null, updates?: InboxUpdates | null): AgentItem[] {
  if (!listing) return [];
  const live = new Map((updates?.threads ?? []).map(thread => [thread.threadId, thread]));
  const items: AgentItem[] = [];
  for (const unit of listing.units) {
    for (const agent of unit.agents) {
      const threads: AgentThreadItem[] = agent.threads.map(thread => {
        const fresh = live.get(thread.threadId);
        return {
          threadId: thread.threadId, title: thread.title, isDefault: thread.isDefault,
          lastMessageAt: fresh?.lastMessageAt ?? thread.lastMessageAt,
          unread: fresh?.unread ?? thread.unread, pending: fresh?.pending ?? false,
        };
      });
      const lastMessageAt = threads.reduce<string | null>(
        (latest, thread) => (time(thread.lastMessageAt) > time(latest) ? thread.lastMessageAt : latest), agent.lastMessageAt,
      );
      items.push({
        key: `${unit.name}/${agent.slug}`,
        peerId: unit.peerId,
        unitName: unit.name,
        unitDisplayName: unit.displayName,
        unitEmoji: unit.emoji,
        unitRole: unit.role,
        roleShort: roleShort(unit.role),
        status: unit.status,
        slug: agent.slug,
        name: agent.name,
        available: agent.available,
        unread: threads.length ? threads.reduce((sum, thread) => sum + thread.unread, 0) : agent.unread,
        pending: threads.some(thread => thread.pending),
        lastMessageAt,
        preview: agent.preview,
        defaultThreadId: agent.threadId,
        threads,
        configureUrl: unit.configureUrl ?? null,
      });
    }
  }
  return items.sort(compareAgents);
}

export function selfAgent(listing: InboxListing | null): SelfAgentItem | null {
  const agent = listing?.home.agent;
  if (!agent) return null;
  return {
    key: 'self', name: agent.name, emoji: agent.emoji, role: agent.role, roleShort: roleShort(agent.role),
    href: agent.href, configureUrl: agent.configureUrl ?? LOCAL_CONFIGURE_URL,
  };
}

/** Self row shown before (or without) the inbox listing, e.g. for non-admins. */
export function fallbackSelfAgent(name: string): SelfAgentItem {
  return { key: 'self', name, emoji: null, role: null, roleShort: null, href: SELF_AGENT_HREF, configureUrl: LOCAL_CONFIGURE_URL };
}

const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** True when a (single-agent) peer's agent is named after its Unit, case/trim-insensitive. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return norm(a) !== '' && norm(a) === norm(b);
}

/** "Agent · Unit", or just one of them when they are the same name. */
export function agentTitle(agentName: string, unitDisplayName: string): string {
  return sameName(agentName, unitDisplayName) ? agentName.trim() : `${agentName} · ${unitDisplayName}`;
}

/**
 * Which agent `/agents` opens on desktop: the remote agent or local chat with
 * the most recent activity. Ties and no activity at all open the local agent.
 */
export function pickIndexHref(agents: AgentItem[], localLastActivity: string | null): string {
  let best: AgentItem | null = null;
  for (const agent of agents) {
    if (!agent.lastMessageAt) continue;
    if (!best || time(agent.lastMessageAt) > time(best.lastMessageAt)) best = agent;
  }
  if (best && time(best.lastMessageAt) > time(localLastActivity)) return agentHref(best.unitName, best.slug);
  return SELF_AGENT_HREF;
}

/** Row subtitle: a single-agent peer is named after its Unit, so only the role is shown. */
export function agentSubtitle(agent: Pick<AgentItem, 'name' | 'unitDisplayName' | 'unitEmoji' | 'roleShort'>): string {
  const unit = `${agent.unitEmoji ? `${agent.unitEmoji} ` : ''}${agent.unitDisplayName}`;
  if (sameName(agent.name, agent.unitDisplayName)) return agent.roleShort ?? unit;
  return agent.roleShort ? `${unit} · ${agent.roleShort}` : unit;
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
