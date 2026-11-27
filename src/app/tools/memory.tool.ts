import { resolveMemoryScope, type MemoryScope } from '@/app/services/memory/memory-scope';
import pool from '@/app/clients/db';
import { assertDomainAccess } from '@/app/lib/domain-access-check';
import type { User } from '@/app/services/auth/auth.service';
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { isUnifiedRecallEnabled } from '@/app/services/knowledge/knowledge-flags';
import { clampKnowledgeLimit, getKnowledgeSearchService } from '@/app/services/knowledge/knowledge-search.service';

export {
  MEMORY_DOMAIN_TOOL_DEFINITIONS,
  RECALL_MEMORY_TOOL_DEFINITION,
  SEARCH_KNOWLEDGE_TOOL_DEFINITION,
} from './memory.tool.definitions';

interface MemoryToolContext {
  user: User;
  conversationId: string;
  callerDomain: string;
  /** Request from a paired Unit: recall stays scoped to the caller domain. */
  federated?: boolean;
}

// createManualMemory never calls the LLM, so no credentials are needed here.
const toolMemoryConfig = { endpoint: '', apiKey: '', model: '' };

const MAX_TOPICS = 8;
const MAX_TOPIC_LENGTH = 40;

function normalizeTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const topics = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const topic = item.trim().toLowerCase().slice(0, MAX_TOPIC_LENGTH);
    if (topic) topics.add(topic);
    if (topics.size >= MAX_TOPICS) break;
  }
  return [...topics];
}

function clampLimit(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(parsed)));
}

async function ensureDomainAccess(user: User, domainSlug: string | undefined): Promise<void> {
  if (domainSlug) await assertDomainAccess(user, domainSlug);
}

/** Read scope of one tool call: a domain (or all), plus shared rows for isolated bots. */
interface ToolReadScope {
  domainSlug: string | undefined;
  includeShared: boolean;
}

async function searchMemories(
  user: User,
  query: string,
  { domainSlug, includeShared }: ToolReadScope,
  limit: number,
) {
  await ensureDomainAccess(user, domainSlug);
  const pattern = `%${query.trim()}%`;
  const result = domainSlug
    ? await pool.query(
        `SELECT id, summary, key_topics, importance_score, emotion, domain_slug, created_at
         FROM conversation_summaries
         WHERE user_id = $1
           AND (domain_slug = $2 OR ($5::boolean AND shared))
           AND (summary ILIKE $3 OR array_to_string(key_topics, ' ') ILIKE $3)
         ORDER BY importance_score DESC, created_at DESC
         LIMIT $4`,
        [user.id, domainSlug, pattern, limit, includeShared],
      )
    : user.is_admin
      ? await pool.query(
        `SELECT id, summary, key_topics, importance_score, emotion, domain_slug, created_at
         FROM conversation_summaries
         WHERE user_id = $1
           AND (summary ILIKE $2 OR array_to_string(key_topics, ' ') ILIKE $2)
         ORDER BY importance_score DESC, created_at DESC
         LIMIT $3`,
        [user.id, pattern, limit],
      )
      : await pool.query(
        `SELECT cs.id, cs.summary, cs.key_topics, cs.importance_score, cs.emotion, cs.domain_slug, cs.created_at
         FROM conversation_summaries cs
         WHERE cs.user_id = $1
           AND (cs.summary ILIKE $2 OR array_to_string(cs.key_topics, ' ') ILIKE $2)
           AND (
             cs.domain_slug IS NULL
             OR EXISTS (
               SELECT 1
               FROM user_domain_access uda
               JOIN domains d ON d.id = uda.domain_id
               WHERE uda.user_id = $1 AND d.slug = cs.domain_slug AND d.is_active = true
             )
           )
         ORDER BY cs.importance_score DESC, cs.created_at DESC
         LIMIT $3`,
        [user.id, pattern, limit],
      );
  return { memories: result.rows };
}

/**
 * Memory recall through the unified knowledge search (semantic plus lexical),
 * keeping the response shape of the keyword search. Falls back to the keyword
 * search when the flag is off or the unified search fails.
 */
async function recallMemories(
  user: User,
  query: string,
  scope: ToolReadScope,
  limit: number,
) {
  await ensureDomainAccess(user, scope.domainSlug);
  if (isUnifiedRecallEnabled()) {
    try {
      const result = await getKnowledgeSearchService().search(user, query, {
        sourceTypes: ['memory'],
        domainSlug: scope.domainSlug ?? null,
        includeShared: scope.includeShared,
        limit,
      });
      return {
        memories: result.hits.map(hit => ({
          id: hit.source_id,
          summary: hit.content,
          key_topics: hit.key_topics ?? [],
          importance_score: hit.importance,
          domain_slug: hit.domain_slug,
          created_at: hit.created_at,
          similarity: hit.similarity,
          match: hit.match,
        })),
      };
    } catch (error) {
      console.warn('[MemoryTool] Unified recall failed, using keyword search:', error instanceof Error ? error.message : error);
    }
  }
  return searchMemories(user, query, scope, limit);
}

const NO_MEMORIES = { memories: [] };

export function buildMemoryTools({ user, callerDomain, federated }: MemoryToolContext) {
  let scopePromise: Promise<MemoryScope> | null = null;
  const callerScope = () => (scopePromise ??= resolveMemoryScope(callerDomain, { federated }));
  /**
   * A bot's scope is fixed (multi-bot PR 3): a `domain_slug` argument from the
   * model can never widen it. Otherwise the argument wins, as before.
   */
  const readScope = async (argDomain: string | undefined, fallback: 'caller' | 'all'): Promise<ToolReadScope | null> => {
    const scope = await callerScope();
    if (scope.locked) {
      if (!scope.memories) return null;
      return { domainSlug: scope.domainSlug ?? undefined, includeShared: scope.includeShared };
    }
    const requested = argDomain?.trim() || undefined;
    if (requested) return { domainSlug: requested, includeShared: false };
    // The chat agent recalls across domains (domain_slug is only a tag); legacy domains stay scoped.
    return { domainSlug: fallback === 'caller' ? scope.domainSlug ?? undefined : undefined, includeShared: false };
  };

  return {
    recall_memory: async (args: { query: string; domain_slug?: string; limit?: number }) => {
      const scope = await readScope(args.domain_slug, 'caller');
      if (!scope) return NO_MEMORIES;
      return recallMemories(user, args.query, scope, clampLimit(args.limit, 5, 20));
    },

    search_memory: async (args: { query: string; domain_slug?: string; limit?: number }) => {
      const scope = await readScope(args.domain_slug, 'all');
      if (!scope) return NO_MEMORIES;
      // The unified search caps results at 25; larger requests keep the keyword path.
      const limit = clampLimit(args.limit, 10, 50);
      return limit <= 25
        ? recallMemories(user, args.query, scope, limit)
        : searchMemories(user, args.query, scope, limit);
    },

    search_knowledge: async (args: {
      query: string;
      source_types?: string[];
      domain_slug?: string;
      limit?: number;
      include_archived?: boolean;
    }) => {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) return { success: false, error: 'Query is required' };
      const caller = await callerScope();
      const scope = await readScope(args.domain_slug, 'all');
      let sourceTypes = Array.isArray(args.source_types) ? args.source_types : undefined;
      // A bot with memory mode `none` still searches its documents (and notes, when allowed).
      if (!scope) sourceTypes = (sourceTypes ?? ['note', 'document', 'memory']).filter((type) => type !== 'memory');
      const domainSlug = scope ? scope.domainSlug : caller.domainSlug ?? undefined;
      await ensureDomainAccess(user, domainSlug);
      const result = await getKnowledgeSearchService().search(user, query, {
        sourceTypes,
        domainSlug: domainSlug ?? null,
        includeShared: scope?.includeShared ?? false,
        includeNotes: caller.locked && caller.includeNotes,
        limit: clampKnowledgeLimit(args.limit),
        includeArchived: args.include_archived === true,
      });
      return {
        semantic_available: result.semanticAvailable,
        results: result.hits.map(hit => ({
          source_type: hit.source_type,
          source_id: hit.source_id,
          title: hit.title,
          snippet: hit.snippet,
          domain_slug: hit.domain_slug,
          score: Number(hit.score.toFixed(4)),
          similarity: hit.similarity === null ? null : Number(hit.similarity.toFixed(4)),
          match: hit.match,
          created_at: hit.created_at,
        })),
      };
    },

    create_memory: async (args: {
      content: string;
      importance?: number;
      emotion?: number;
      domain_slug?: string;
      topics?: string[];
      share_with_unit?: boolean;
    }) => {
      const caller = await callerScope();
      // A bot always writes under its own slug; `share_with_unit` overrides its default.
      const domainSlug = caller.locked ? callerDomain : args.domain_slug?.trim() || callerDomain;
      const shared = caller.locked
        ? (typeof args.share_with_unit === 'boolean' ? args.share_with_unit : caller.writeShared)
        : true;
      await ensureDomainAccess(user, domainSlug);
      const content = typeof args.content === 'string' ? args.content.trim() : '';
      if (!content) return { success: false, error: 'Memory content is required' };
      const importance = Math.max(1, Math.min(10, Math.trunc(Number(args.importance) || 7)));
      const emotionValue = Number(args.emotion);
      const emotion = (emotionValue === -1 || emotionValue === 0 || emotionValue === 1) ? emotionValue : 0;

      // Tool-created memories are standalone rows (conversation_id NULL) so that a
      // later conversation summary (upsert on conversation_id) never overwrites them,
      // and so they do not block automatic summarisation of the conversation.
      const memory = await new ConversationMemoryService(toolMemoryConfig, domainSlug).createManualMemory(user.id, {
        content,
        keyTopics: normalizeTopics(args.topics),
        importanceScore: importance,
        emotion,
        shared,
      });
      return {
        success: true,
        memory: {
          id: memory.id,
          summary: memory.summary,
          domain_slug: memory.domain_slug ?? domainSlug,
          ...(caller.locked && { shared }),
        },
      };
    },

    delete_memory: async (args: { memory_id: string }) => {
      const caller = await callerScope();
      // A bot deletes only its own memories, never another bot's or the Unit's shared ones.
      const deleted = caller.locked
        ? await pool.query(
          'DELETE FROM conversation_summaries WHERE id = $1 AND user_id = $2 AND domain_slug = $3 RETURNING id',
          [args.memory_id, user.id, callerDomain],
        )
        : await pool.query(
          'DELETE FROM conversation_summaries WHERE id = $1 AND user_id = $2 RETURNING id',
          [args.memory_id, user.id],
        );
      return { success: deleted.rowCount === 1, memory_id: args.memory_id };
    },
  };
}
