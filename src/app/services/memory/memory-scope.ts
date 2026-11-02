/**
 * Memory scope (simplification phase 3a, Q2): one memory per agent.
 *
 * The local `chat` agent reads memories and summaries of every domain the
 * user can access; `domain_slug` stays on each row only as a tag, and writes
 * keep tagging it. Legacy domain chats still read their own domain. Requests
 * from paired Units keep the previous, domain-scoped reach.
 *
 * Tickets are never part of memory or knowledge retrieval.
 */
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
