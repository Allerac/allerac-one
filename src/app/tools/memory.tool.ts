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

async function searchMemories(
  user: User,
  query: string,
  domainSlug: string | undefined,
  limit: number,
) {
  await ensureDomainAccess(user, domainSlug);
  const pattern = `%${query.trim()}%`;
  const result = domainSlug
    ? await pool.query(
        `SELECT id, summary, key_topics, importance_score, emotion, domain_slug, created_at
         FROM conversation_summaries
         WHERE user_id = $1
           AND domain_slug = $2
           AND (summary ILIKE $3 OR array_to_string(key_topics, ' ') ILIKE $3)
         ORDER BY importance_score DESC, created_at DESC
         LIMIT $4`,
        [user.id, domainSlug, pattern, limit],
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
  domainSlug: string | undefined,
  limit: number,
) {
  await ensureDomainAccess(user, domainSlug);
  if (isUnifiedRecallEnabled()) {
    try {
      const result = await getKnowledgeSearchService().search(user, query, {
        sourceTypes: ['memory'],
        domainSlug: domainSlug ?? null,
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
  return searchMemories(user, query, domainSlug, limit);
}

export function buildMemoryTools({ user, callerDomain }: MemoryToolContext) {
  return {
    recall_memory: async (args: { query: string; domain_slug?: string; limit?: number }) => {
      const domainSlug = args.domain_slug?.trim() || callerDomain;
      return recallMemories(user, args.query, domainSlug, clampLimit(args.limit, 5, 20));
    },

    search_memory: async (args: { query: string; domain_slug?: string; limit?: number }) => {
      const domainSlug = args.domain_slug?.trim() || undefined;
      // The unified search caps results at 25; larger requests keep the keyword path.
      const limit = clampLimit(args.limit, 10, 50);
      return limit <= 25
        ? recallMemories(user, args.query, domainSlug, limit)
        : searchMemories(user, args.query, domainSlug, limit);
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
      const domainSlug = args.domain_slug?.trim() || undefined;
      await ensureDomainAccess(user, domainSlug);
      const result = await getKnowledgeSearchService().search(user, query, {
        sourceTypes: Array.isArray(args.source_types) ? args.source_types : undefined,
        domainSlug: domainSlug ?? null,
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
    }) => {
      const domainSlug = args.domain_slug?.trim() || callerDomain;
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
      });
      return {
        success: true,
        memory: { id: memory.id, summary: memory.summary, domain_slug: memory.domain_slug ?? domainSlug },
      };
    },

    delete_memory: async (args: { memory_id: string }) => {
      const deleted = await pool.query(
        'DELETE FROM conversation_summaries WHERE id = $1 AND user_id = $2 RETURNING id',
        [args.memory_id, user.id],
      );
      return { success: deleted.rowCount === 1, memory_id: args.memory_id };
    },
  };
}
