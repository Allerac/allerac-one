/**
 * Memory scope (simplification phase 3a, Q2, and multi-bot PR 3).
 *
 * - The local `chat` agent (the default bot) reads memories and summaries of
 *   every domain the user can access, including other bots' private ones
 *   (owner decision, 2026-11-27). `domain_slug` stays on each row as a tag.
 * - Legacy domain chats still read their own domain.
 * - A non-default bot (ALLERAC_BOTS) reads according to its `memory_mode`:
 *   `isolated`: its own rows plus rows marked `shared`; `all`: like `chat`;
 *   `none`: no memories. Notes are readable only with the `notes` capability.
 *   Tool arguments can never widen a bot's scope.
 * - Requests from paired Units keep the previous, domain-scoped reach.
 *
 * Rows written by `chat`, legacy domains and Telegram are `shared` (column
 * default TRUE, migration 159). A bot writes `shared = false` unless it shares
 * by default or the memory is explicitly shared.
 *
 * Tickets are never part of memory or knowledge retrieval.
 */
import { enabledBotCapabilities, isCandidateBotSlug, isRunnableBot } from '@/app/services/agent/bot-runtime';
import type { UnitAgent } from '@/app/services/agent/unit-agents';
import { getUnitAgent } from '@/app/services/agent/unit-agents.repository';

export const UNIFIED_MEMORY_DOMAIN = 'chat';

/** Domain filter for memory/knowledge reads: null means "all accessible domains". */
export function memoryReadDomain(
  domain: string | null | undefined,
  options: { federated?: boolean } = {},
): string | null {
  const slug = domain ?? null;
  if (slug === UNIFIED_MEMORY_DOMAIN && options.federated !== true) return null;
  return slug;
}

export interface MemoryScope {
  /** Domain filter; null = every accessible domain. */
  domainSlug: string | null;
  /** Also read rows marked `shared` (isolated bots). */
  includeShared: boolean;
  /** Also read the notes vault while `domainSlug` is set (bots with the notes capability). */
  includeNotes: boolean;
  /** False for bots with memory_mode `none`. */
  memories: boolean;
  /** The caller is a bot: tool arguments (domain_slug) must not change this scope. */
  locked: boolean;
  /** `shared` value for memories this caller writes. */
  writeShared: boolean;
}

/** Scope for a domain that is not a bot (default agent, legacy domains, peers). Unchanged behaviour. */
export function domainMemoryScope(domain: string | null | undefined, options: { federated?: boolean } = {}): MemoryScope {
  return {
    domainSlug: memoryReadDomain(domain, options),
    includeShared: false,
    includeNotes: false,
    memories: true,
    locked: false,
    writeShared: true,
  };
}

/** Scope for a non-default bot. Federated requests never reach bots (PR 8). */
export function botMemoryScope(bot: UnitAgent): MemoryScope {
  const includeNotes = enabledBotCapabilities(bot.toolSettings).includes('notes');
  const writeShared = bot.shareMemoriesByDefault === true;
  if (bot.memoryMode === 'all') {
    return { domainSlug: null, includeShared: false, includeNotes, memories: true, locked: true, writeShared };
  }
  return {
    domainSlug: bot.slug,
    includeShared: bot.memoryMode === 'isolated',
    includeNotes,
    memories: bot.memoryMode !== 'none',
    locked: true,
    writeShared,
  };
}

/** Looks the domain up in the bot registry (30 s cache). Never throws: falls back to the domain scope. */
export async function resolveMemoryScope(
  domain: string | null | undefined,
  options: { federated?: boolean } = {},
): Promise<MemoryScope> {
  if (options.federated !== true && isCandidateBotSlug(domain)) {
    const agent = await getUnitAgent(domain);
    if (agent && !agent.isDefault) {
      // An archived or disabled bot gets no turns; if one is reached anyway, it reads nothing.
      return isRunnableBot(agent) ? botMemoryScope(agent) : { ...botMemoryScope(agent), memories: false };
    }
  }
  return domainMemoryScope(domain, options);
}
