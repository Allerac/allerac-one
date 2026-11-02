/**
 * Phase 3b of the simplification plan: domain tabs, the taskbar and the
 * per-domain chats are hidden unless ALLERAC_LEGACY_DOMAINS=true. Data pages
 * (health dashboard, notes, email inbox, ...) stay reachable as plain views.
 *
 * This file has no server-only imports so client components can use the
 * pure helpers (DATA_PAGES, isSafeRelativeHref).
 */
import { isDomainEnabled } from '@/modules/registry';

type Env = Record<string, string | undefined>;

/** Home of the single conversation surface. */
export const AGENT_HOME_PATH = '/agents/self/agent';

/** Legacy domain UI (tabs, taskbar, DomainChip, per-domain chats). Default off. */
export function isLegacyDomainsEnabled(env: Env = process.env): boolean {
  return (env.ALLERAC_LEGACY_DOMAINS ?? '').trim().toLowerCase() === 'true';
}

export interface DataPage {
  /** Domain slug that gates the page. */
  id: string;
  label: string;
  icon: string;
  /** Relative URL of the page. */
  path: string;
  /** Text of the link shown under a tool result. */
  linkLabel: string;
  /** Tools whose results point at this page. */
  tools: readonly string[];
}

export const DATA_PAGES: readonly DataPage[] = [
  {
    id: 'health', label: 'Health', icon: '❤️', path: '/health', linkLabel: 'Open health dashboard',
    tools: ['get_health_summary', 'get_health_metrics', 'get_daily_snapshot', 'get_garmin_status', 'get_recent_activities', 'get_activity_detail'],
  },
  {
    id: 'notes', label: 'Notes', icon: '📝', path: '/notes', linkLabel: 'Open notes',
    tools: ['save_note', 'get_note', 'list_notes', 'update_note', 'delete_note', 'query_vault'],
  },
  {
    id: 'email', label: 'Email', icon: '✉️', path: '/email', linkLabel: 'Open email inbox',
    tools: ['list_emails', 'read_email', 'send_email'],
  },
  {
    id: 'jobs', label: 'Jobs', icon: '⏰', path: '/jobs', linkLabel: 'Open scheduled jobs',
    tools: ['create_job', 'list_jobs', 'update_job', 'delete_job', 'toggle_job', 'schedule_task'],
  },
  {
    id: 'memory', label: 'Knowledge', icon: '🗂️', path: '/memory', linkLabel: 'Open knowledge graph',
    tools: ['search_knowledge'],
  },
  {
    id: 'music', label: 'Music', icon: '🎵', path: '/music', linkLabel: 'Open music dashboard',
    tools: ['get_music_recommendations', 'get_top_tracks', 'get_listening_stats', 'get_spotify_status', 'get_playlists', 'get_playlist_tracks', 'create_playlist', 'add_tracks_to_playlist'],
  },
  { id: 'channels', label: 'Channels', icon: '📡', path: '/channels', linkLabel: 'Open channels', tools: [] },
];

export type DataPageId = 'health' | 'notes' | 'email' | 'jobs' | 'memory' | 'music' | 'channels';

export function getDataPage(id: string): DataPage | undefined {
  return DATA_PAGES.find(p => p.id === id);
}

/** Data pages whose module is enabled, optionally narrowed to the slugs a user can access. */
export function getEnabledDataPages(allowedSlugs?: readonly string[] | null, env: Env = process.env): DataPage[] {
  return DATA_PAGES.filter(p => isDomainEnabled(p.id, env) && (!allowedSlugs || allowedSlugs.includes(p.id)));
}

/** Domains whose own chat route redirects to the agent when legacy domains are off. */
export const CHAT_ONLY_DOMAINS: readonly string[] = ['chat', 'search', 'social'];

export interface PageLink { href: string; label: string }

/** Deep link to the data page behind a tool, or null. */
export function dataPageLinkForTool(toolName: string, env: Env = process.env): PageLink | null {
  const page = DATA_PAGES.find(p => p.tools.includes(toolName));
  if (!page || !isDomainEnabled(page.id, env)) return null;
  return { href: page.path, label: page.linkLabel };
}

/** Only same-origin relative paths ("/x", not "//x", no scheme, no backslash). */
export function isSafeRelativeHref(href: unknown): href is string {
  return typeof href === 'string'
    && /^\/[A-Za-z0-9\-._~/?=&%#]*$/.test(href)
    && !href.startsWith('//')
    && href.length <= 200;
}
