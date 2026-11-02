/**
 * Which data pages belong to an agent (one Unit = one agent): a page shows
 * when its module is enabled on the Unit and, if the agent tool settings
 * (phase 3a) own a capability with the same id, that capability is on.
 * Pure: shared by the local Pages menu and the federation agents list.
 */
import { DATA_PAGES, type DataPage } from '@/lib/legacy-domains';
import { isDomainEnabled } from '@/modules/registry';
import { isCapabilityEnabled, listAgentCapabilities, type AgentToolSettings } from './agent-tool-settings';

type Env = Record<string, string | undefined>;

export function agentDataPages(settings: AgentToolSettings, env: Env = process.env): DataPage[] {
  const capabilities = new Map(listAgentCapabilities(env).map(c => [c.id, c]));
  return DATA_PAGES.filter(page => {
    if (!isDomainEnabled(page.id, env)) return false;
    const capability = capabilities.get(page.id);
    return !capability || isCapabilityEnabled(capability, settings);
  });
}

export function agentDataPageIds(settings: AgentToolSettings, env: Env = process.env): string[] {
  return agentDataPages(settings, env).map(page => page.id);
}

export interface AgentPageLink { id: string; label: string; icon: string; url: string }

/**
 * Page links for a peer's agent from the ids it reported: unknown ids are
 * dropped and every link points at the peer's own origin. No origin or no
 * list (offline, older Unit) means no pages, never a guess.
 */
export function peerPageLinks(ids: readonly string[] | null | undefined, origin: string | null | undefined): AgentPageLink[] {
  if (!ids || !origin) return [];
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return [];
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return [];
  const wanted = new Set(ids);
  return DATA_PAGES.filter(page => wanted.has(page.id))
    .map(page => ({ id: page.id, label: page.label, icon: page.icon, url: `${base.origin}${page.path}` }));
}
